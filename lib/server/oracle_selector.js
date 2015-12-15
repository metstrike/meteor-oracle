// The minimongo selector compiler!

// Terminology:
//  - a "selector" is the EJSON object representing a selector
//  - a "matcher" is its compiled form (whether a full OracleSelector
//    object or one of the component lambdas that matches parts of it)
//  - a "result object" is an object with a "result" field and maybe
//    distance and arrayIndices.
//  - a "branched value" is an object with a "value" field and maybe
//    "dontIterate" and "arrayIndices".
//  - a "document" is a top-level object that can be stored in a collection.
//  - a "lookup function" is a function that takes in a document and returns
//    an array of "branched values".
//  - a "branched matcher" maps from an array of branched values to a result
//    object.
//  - an "element matcher" maps from a single value to a bool.

// Main entry point.
//   var matcher = new OracleSelector({a: {$gt: 5}});
//   if (matcher.documentMatches({a: 7})) ...
OracleSelector = function (selector, tableName, db) {
  var self = this;
  // A set (object mapping string -> *) of all of the document paths looked
  // at by the selector. Also includes the empty string if it may look at any
  // path (eg, $where).
  self._paths = {};
  // Set to true if compilation finds a $near.
  self._hasGeoQuery = false;
  // Set to true if compilation finds a $where.
  self._hasWhere = false;
  // Set to false if compilation finds anything other than a simple equality or
  // one or more of '$gt', '$gte', '$lt', '$lte', '$ne', '$in', '$nin' used with
  // scalars as operands.
  self._isSimple = true;
  // Set to a dummy document which always matches this Matcher. Or set to null
  // if such document is too hard to find.
  self._matchingDocument = undefined;
  // A clone of the original selector. It may just be a function if the user
  // passed in a function; otherwise is definitely an object (eg, IDs are
  // translated into {_id: ID} first. Used by canBecomeTrueByModifier and
  // Sorter._useWithMatcher.
  self._selector = null;
  self._tableName = tableName;
  self._fields = {};
  self._db = db;
  self._docMatcher = self._compileSelector(selector);
};

OracleSelector._prepare = function(selector, tableName, db) {
	var sls = {};
	
	if(!selector) {
		return sls;
	}
	
	var tableDesc = undefined;
	
	if(tableName && db) {
		tableDesc = db._tables[tableName]; 
	}
	for(var fn in selector) {
		if(typeof fn === 'string' && fn[0] === '.') {
			var fa = fn.slice(1).split(".");

			var sl = sls;
			
			for(var i = 0; i < fa.length; i++) {
				var fi = fa[i];
				
				if(sl[fi] === undefined) {
					var n = {};
					sl[fi] = n;
					sl = n;
				}
			}
			
			if(sl["."] === undefined) {
				sl["."] = selector[fn];
			} else {
				throw new Error("Duplicate embedded selector "+fn+", use $elemMatch to concatenate");
			}
		} else if(fn.indexOf(".") < 0 && tableDesc && tableDesc.details && tableDesc.details[fn]) {			
			// Add nested field to sls["."]
			var sl = sls["."];
			
			if(sl === undefined) {
				sl = {};
				sls["."] = sl;
			}
			
			sl[fn+"._value"] = selector[fn];
			
		} else {
			// Add field to sls["."]
			var sl = sls["."];
			
			if(sl === undefined) {
				sl = {};
				sls["."] = sl;
			}
			
			sl[fn] = selector[fn];
		}		
	}

	return sls;
};

OracleSelector._compile = function(selector, tableName) {
	var s = new OracleSelector(selector, tableName);

	return s._docMatcher;
};

OracleSelector._compilePrepared = function(selector, tableName, db) {
	var rs = {};
	for(fn in selector) {
		var value = selector[fn];
		
		if(fn === ".") {
			var s = new OracleSelector(value, tableName, db);
			rs[fn] =  s._docMatcher;
			rs["*"] = s._fields;
		} else {
			var nestedTableName = tableName+"$"+fn;
			
			rs[fn] =  OracleSelector._compilePrepared(value, nestedTableName, db);
		}
	}
	
	return rs;
};

OracleSelector.process = function(selector, tableName, db) {
	var s = OracleSelector._prepare(selector, tableName, db);

	s = OracleSelector._compilePrepared(s, tableName, db);
	
	return s;
};

_.extend(OracleSelector.prototype, {
  hasGeoQuery: function () {
    return this._hasGeoQuery;
  },
  hasWhere: function () {
    return this._hasWhere;
  },
  isSimple: function () {
    return this._isSimple;
  },

  // Given a selector, return a function that takes one argument, a
  // document. It returns a result object.
  _compileSelector: function (selector) {
    var self = this;

    // shorthand -- scalars match _id
    if (LocalCollection._selectorIsId(selector)) {
      self._selector = {_id: selector};
      self._recordPathUsed('_id');
      return OracleDB.q("_id")+" = "+_prepareOperand(selector);
    }

    // protect against dangerous selectors.  falsey and {_id: falsey} are both
    // likely programmer error, and not what you want, particularly for
    // destructive operations.
    if (!selector || (('_id' in selector) && !selector._id)) {
      self._isSimple = false;
      return "1 = 0";
    }

    // Top level can't be an array or true or binary.
    if (typeof(selector) === 'boolean' || isArray(selector) ||
        EJSON.isBinary(selector))
      throw new Error("Invalid selector: " + selector);

    self._selector = EJSON.clone(selector);
    return self.compileDocumentSelector(selector, self, {isRoot: true});
  },
  _recordPathUsed: function (path) {
    this._paths[path] = true;
  },
  // Returns a list of key paths the given selector is looking for. It includes
  // the empty string if there is a $where.
  _getPaths: function () {
    return _.keys(this._paths);
  }
});

var _convertDate = function(date) {
	// Create a date object with the current time
	  var now = date;

	// Create an array with the current month, day and time
	  var date = [ now.getMonth() + 1, now.getDate(), now.getFullYear() ];

	// Create an array with the current hour, minute and second
	  var time = [ now.getHours(), now.getMinutes(), now.getSeconds() ];

		// If seconds and minutes are less than 10, add a zero
	  for ( var i = 0; i < 2; i++ ) {
	    if ( date[i] < 10 ) {
	      date[i] = "0" + date[i];
	    }
	  }

		// If seconds and minutes are less than 10, add a zero
	  for ( var i = 0; i < 3; i++ ) {
	    if ( time[i] < 10 ) {
	      time[i] = "0" + time[i];
	    }
	  }

	// Return the formatted string
	  var s = date.join("/") + " " + time.join(":");
	  
	  var ms = now.getMilliseconds();
	  
	  if(ms === 0) {
		  s = "to_date('"+s+"', 'mm/dd/yyyy hh24:mi:ss')";
	  } else {
		  var mss = ms.toString();
		  while(mss.length < 3) {
			  mss = '0' + mss;
		  }
		  s = s + "." + mss;
		  s = "to_timestamp('"+s+"', 'mm/dd/yyyy hh24:mi:ss.ff3')";
	  }

	  return s;
};
	
var _prepareOperand = function(operand) {
	  var ret = null;
	  
	  if(operand instanceof Array) {
		operand = operand[0];  
	  }
	  
	    if (typeof operand === 'boolean') {
	    	ret = operand ? "'true'" : "'false'";
	    } else if (typeof operand === 'string') {
	    	operand = operand.replace("'", "''");
	    	operand = operand.replace("\n", "' || chr(10) ||'");
	    	ret = "'"+operand+"'";
	    } else if(operand instanceof Date) {
	    	ret = _convertDate(operand);
	    } else {
	    	ret = operand;
	    }
	    
	    return ret;
};


// Takes in a selector that could match a full document (eg, the original
// selector). Returns a function mapping document->result object.
//
// matcher is the Matcher object we are compiling.
//
// If this is the root document selector (ie, not wrapped in $and or the like),
// then isRoot is true. (This is used by $near.)
OracleSelector.prototype.compileDocumentSelector = function (docSelector, matcher, options) {
	var self = this;
  options = options || {};
  var docMatchers = [];
  _.each(docSelector, function (subSelector, key) {
    if (key.substr(0, 1) === '$') {
      // Outer operators are either logical operators (they recurse back into
      // this function), or $where.
      if (!_.has(LOGICAL_OPERATORS, key))
        throw new Error("Unrecognized logical operator: " + key);
      matcher._isSimple = false;
      var logicalMatcher = LOGICAL_OPERATORS[key](subSelector, matcher,
              options.inElemMatch, self);
      if(logicalMatcher && logicalMatcher !== "") {
    	  docMatchers.push(logicalMatcher);
      }
    } else {
      // Record this path, but only if we aren't in an elemMatcher, since in an
      // elemMatch this is a path inside an object in an array, not in the doc
      // root.
      if (!options.inElemMatch)
        matcher._recordPathUsed(key);
      
      var valueMatcher =
        self.compileValueSelector(subSelector, matcher, options.isRoot);
      
      if(valueMatcher && valueMatcher !== "") {
          var parts = key.split('.');
          var firstPart = parts.length ? parts[0] : '';
          
          if(isNumericKey(firstPart)) {
        	  throw new Error("Wrong key if firstPartIsNumeric");
          }
          var nextPartIsNumeric = parts.length >= 2 && isNumericKey(parts[1]);

          var s;          
          var firstPartTable = OracleDB._tableNameM2O(firstPart);
          
          if(parts.length <= 1) {
        	  self._fields[key] = null;
        	  
              var column = OracleDB._columnNameM2O(key);

              column = OracleDB.q(column);

        	  s = valueMatcher(column);
          } else if(parts.length === 2) {
        	  if(isNumericKey(parts[1])) {
            	  throw new Error("Wrong key field.N");       		  
        	  }
        	  
              var column = OracleDB._columnNameM2O(parts[1]);

              column = OracleDB.q(column);
              
              if(parts[1] === "_value" && subSelector["$ne"] !== undefined) {
                  var valueMatcher2 =
                      self.compileValueSelector({"$eq": subSelector["$ne"]}, matcher, options.isRoot);

            	  s = OracleDB.q("_id")+" NOT IN (SELECT DISTINCT "+OracleDB.q("_id")+" FROM "+OracleDB.q(self._tableName+"$"+firstPartTable)+" WHERE "+valueMatcher2(column)+")";
              } else {
            	  s = OracleDB.q("_id")+" IN (SELECT DISTINCT "+OracleDB.q("_id")+" FROM "+OracleDB.q(self._tableName+"$"+firstPartTable)+" WHERE "+valueMatcher(column)+")";
              }
          } else if(parts.length === 3) {
           	  if(!isNumericKey(parts[1])) {
            	  throw new Error("Wrong key field.field.field");       		  
        	  }
           	  if(isNumericKey(parts[2])) {
            	  throw new Error("Wrong key field.field.N");       		  
        	  }
        	  
              var column = OracleDB._columnNameM2O(parts[2]);

              column = OracleDB.q(column);
              
         	  s = OracleDB.q("_id")+" IN (SELECT DISTINCT "+OracleDB.q("_id")+" FROM "+OracleDB.q(self._tableName+"$"+firstPartTable)+" WHERE "+OracleDB.q("_indexNo")+" = "+parts[1]+" AND "+valueMatcher(column)+")";
          } else {
        	  throw new Error("Wrong key with more than 2 dots");
          }
          
    	  docMatchers.push(s);
      }
    }
  });

  return andDocumentMatchers(docMatchers);
};

// Takes in a selector that could match a key-indexed value in a document; eg,
// {$gt: 5, $lt: 9}, or a regular expression, or any non-expression object (to
// indicate equality).  Returns a branched matcher: a function mapping
// [branched value]->result object.
OracleSelector.prototype.compileValueSelector = function (valueSelector, matcher, isRoot) {
	var self = this;
	
  if (valueSelector instanceof RegExp) {
    matcher._isSimple = false;
    return convertElementMatcherToBranchedMatcher(
      regexpElementMatcher(valueSelector));
  } else if (isOperatorObject(valueSelector)) {
    return self.operatorBranchedMatcher(valueSelector, matcher, isRoot);
  } else {
    return equalityElementMatcher(valueSelector);
  }
};

// Given an element matcher (which evaluates a single value), returns a branched
// value (which evaluates the element matcher on all the branches and returns a
// more structured return value possibly including arrayIndices).
var convertElementMatcherToBranchedMatcher = function (
    elementMatcher, options) {
  options = options || {};
  return elementMatcher;
};

// Takes a RegExp object and returns an element matcher.
regexpElementMatcher = function (regexp) {
  return function (key) {
    if (regexp instanceof RegExp) {
    	 throw Error("Regular expression operant has to be a string (not RegExp object)");
    }

    return "REGEXP_LIKE("+key+", "+_prepareOperand(regexp)+")";
  };
};

//Takes something that is not an operator object and returns an element matcher
//for equality with that thing.
equalityElementMatcher = function (elementSelector) {
if (isOperatorObject(elementSelector))
 throw Error("Can't create equalityValueSelector for operator object");

// Special-case: null and undefined are equal (if you got undefined in there
// somewhere, or if you got it due to some branch being non-existent in the
// weird special case), even though they aren't with EJSON.equals.
if (elementSelector == null) {  // undefined or null
 return function (key) {
   return key + " IS NULL";  // undefined or null
 };
}

return function (key) {
 return key + " = " + _prepareOperand(elementSelector);
};
};

//Takes something that is not an operator object and returns an element matcher
//for equality with that thing.
inequalityElementMatcher = function (elementSelector) {
if (isOperatorObject(elementSelector))
 throw Error("Can't create equalityValueSelector for operator object");

// Special-case: null and undefined are equal (if you got undefined in there
// somewhere, or if you got it due to some branch being non-existent in the
// weird special case), even though they aren't with EJSON.equals.
if (elementSelector == null) {  // undefined or null
 return function (key) {
   return key + " IS NOT NULL";  // undefined or null
 };
}

return function (key) {
 return "(" + key + " <> " + _prepareOperand(elementSelector) + " OR " + key + " IS NULL" + ")";
};
};

// Takes an operator object (an object with $ keys) and returns a branched
// matcher for it.
OracleSelector.prototype.operatorBranchedMatcher = function (valueSelector, matcher, isRoot) {
	var self = this;
  // Each valueSelector works separately on the various branches.  So one
  // operator can match one branch and another can match another branch.  This
  // is OK.

  var operatorMatchers = [];
  _.each(valueSelector, function (operand, operator) {
    // XXX we should actually implement $eq, which is new in 2.6
    var simpleRange = _.contains(['$lt', '$lte', '$gt', '$gte'], operator) &&
      _.isNumber(operand);
    var simpleInequality = operator === '$ne' && !_.isObject(operand);
    var simpleInclusion = _.contains(['$in', '$nin'], operator) &&
      _.isArray(operand) && !_.any(operand, _.isObject);

    if (! (operator === '$eq' || simpleRange ||
           simpleInclusion || simpleInequality)) {
      matcher._isSimple = false;
    }

    if (_.has(VALUE_OPERATORS, operator)) {
      operatorMatchers.push(
        VALUE_OPERATORS[operator](operand, valueSelector, matcher, isRoot, self));
    } else if (_.has(ELEMENT_OPERATORS, operator)) {
      var options = ELEMENT_OPERATORS[operator];
      operatorMatchers.push(
          options.compileElementSelector(
            operand, self, valueSelector, matcher));
    } else {
      throw new Error("Unrecognized operator: " + operator);
    }
  });

  return andBranchedMatchers(operatorMatchers);
};

OracleSelector.prototype.compileArrayOfDocumentSelectors = function (
    selectors, matcher, inElemMatch) {
	var self = this;
	
  if (!isArray(selectors) || _.isEmpty(selectors))
    throw Error("$and/$or/$nor must be nonempty array");
  return _.map(selectors, function (subSelector) {
    if (!isPlainObject(subSelector))
      throw Error("$or/$and/$nor entries need to be full objects");
    return self.compileDocumentSelector(
      subSelector, matcher, {inElemMatch: inElemMatch});
  });
};

// Operators that appear at the top level of a document selector.
var LOGICAL_OPERATORS = {
  $and: function (subSelector, matcher, inElemMatch, oracleSelector) {
    var matchers = oracleSelector.compileArrayOfDocumentSelectors(
      subSelector, matcher, inElemMatch);
    return andDocumentMatchers(matchers);
  },

  $or: function (subSelector, matcher, inElemMatch, oracleSelector) {
    var matchers = oracleSelector.compileArrayOfDocumentSelectors(
      subSelector, matcher, inElemMatch);

    // Special case: if there is only one matcher, use it directly, *preserving*
    // any arrayIndices it returns.
    if (matchers.length === 1)
      return matchers[0];

    return orDocumentMatchers(matchers);
  },

  $nor: function (subSelector, matcher, inElemMatch, oracleSelector) {
    var matchers = oracleSelector.compileArrayOfDocumentSelectors(
      subSelector, matcher, inElemMatch);

    return "NOT("+orDocumentMatchers(matchers)+")";
  },

  $where: function (selectorValue, matcher) {
	  return selectorValue;
  },

  // This is just used as a comment in the query (in MongoDB, it also ends up in
  // query logs); it has no effect on the actual selection.
  $comment: function () {
      return "";
  }
};

// Returns a branched matcher that matches iff the given matcher does not.
// Note that this implicitly "deMorganizes" the wrapped function.  ie, it
// means that ALL branch values need to fail to match innerBranchedMatcher.
var invertBranchedMatcher = function (branchedMatcher) {
  return function (key) {
    var invertMe = branchedMatcher(key);
    // We explicitly choose to strip arrayIndices here: it doesn't make sense to
    // say "update the array element that does not match something", at least
    // in mongo-land.
    return "NOT("+invertMe+")";
  };
};

// Operators that (unlike LOGICAL_OPERATORS) pertain to individual paths in a
// document, but (unlike ELEMENT_OPERATORS) do not have a simple definition as
// "match each branched value independently and combine with
// convertElementMatcherToBranchedMatcher".
var VALUE_OPERATORS = {
  $not: function (operand, valueSelector, matcher, isRoot, oracleSelector) {
    return invertBranchedMatcher(oracleSelector.compileValueSelector(operand, matcher));
  },
  $eq: function (operand) {
	    return convertElementMatcherToBranchedMatcher(
	      equalityElementMatcher(operand));
  },
  $ne: function (operand) {
	    return convertElementMatcherToBranchedMatcher(
	      inequalityElementMatcher(operand));
  },
  $exists: function (operand) {
    var exists = convertElementMatcherToBranchedMatcher(function (key) {
      return key + (operand ? " IS NOT NULL" : " IS NULL");
    });
    return exists;
  },
  // $options just provides options for $regex; its logic is inside $regex
  $options: function (operand, valueSelector) {
    if (!_.has(valueSelector, '$regex'))
      throw Error("$options needs a $regex");
    return "";
  },
  // $maxDistance is basically an argument to $near
  $maxDistance: function (operand, valueSelector) {
      throw Error("$maxDistance operator is not supported yet");
  },
  $all: function (operand, valueSelector, matcher) {
      throw Error("$all operator is not supported yet");
  },
  $near: function (operand, valueSelector, matcher, isRoot) {
      throw Error("$near operator is not supported yet");
  }
};

// Helper for $lt/$gt/$lte/$gte.
var makeInequality = function (cmpValueComparator) {
  return {
    compileElementSelector: function (operand, oracleSelector) {
      // Arrays never compare false with non-arrays for any inequality.
      // XXX This was behavior we observed in pre-release MongoDB 2.5, but
      //     it seems to have been reverted.
      //     See https://jira.mongodb.org/browse/SERVER-11444
      if (isArray(operand)) {
        return function () {
          return false;
        };
      }

      // Special case: consider undefined and null the same (so true with
      // $gte/$lte).
      if (operand === undefined)
        operand = null;

      var operandType = LocalCollection._f._type(operand);

      return function (key) {
        return cmpValueComparator(key, operand);
      };
    }
  };
};

// Each element selector contains:
//  - compileElementSelector, a function with args:
//    - operand - the "right hand side" of the operator
//    - valueSelector - the "context" for the operator (so that $regex can find
//      $options)
//    - matcher - the Matcher this is going into (so that $elemMatch can compile
//      more things)
//    returning a function mapping a single value to bool.
//  - dontExpandLeafArrays, a bool which prevents expandArraysInBranches from
//    being called
//  - dontIncludeLeafArrays, a bool which causes an argument to be passed to
//    expandArraysInBranches if it is called
ELEMENT_OPERATORS = {
  $lt: makeInequality(function (key, operand) {
    return key + " < " + _prepareOperand(operand);
  }),
  $like: makeInequality(function (key, operand) {
	    return key + " LIKE " + _prepareOperand(operand);
  }),
  $gt: makeInequality(function (key, operand) {
    return key + " > " + _prepareOperand(operand);
  }),
  $lte: makeInequality(function (key, operand) {
    return key + " <= " + _prepareOperand(operand);
  }),
  $gte: makeInequality(function (key, operand) {
    return key + " >= " + _prepareOperand(operand);
  }),
  $mod: {
    compileElementSelector: function (operand) {
      if (!(isArray(operand) && operand.length === 2
            && typeof(operand[0]) === 'number'
            && typeof(operand[1]) === 'number')) {
        throw Error("argument to $mod must be an array of two numbers");
      }
      // XXX could require to be ints or round or something
      var divisor = operand[0];
      var remainder = operand[1];
      return function (key) {
   	    return "mod("+key+ ", " + _prepareOperand(divisor)+") = "+_prepareOperand(remainder);
      };
    }
  },
  $in: {
	    compileElementSelector: function (operand, oracleSelector) {
	      if (!isArray(operand))
	        throw Error("$in needs an array");

	      var elementMatchers = [];
	      _.each(operand, function (option) {
	        if (option instanceof RegExp)
		        throw Error("regexp inside $in is not supported yet");
	        else if (isOperatorObject(option))
	          throw Error("cannot nest $ under $in");
	        else
	          elementMatchers.push(option);
	      });

	      if(elementMatchers.length === 0) {
	          // throw Error("no values applied to $in");
	    	  // Looks like on the server side $in: [] should work, at least Telescope produces this query
	    	  // So generate a FALSE expression
	    	  return function(key) {
	    		  return "(1=0)";
	    	  }
	      }
	      return function (key) {
	    	  	var tableDesc = oracleSelector._db && oracleSelector._db._tables[oracleSelector._tableName];
	    	  	var ret = undefined;

	    	  	var inClause = "IN (";
	    	  	var i = 0;
	    	    _.any(elementMatchers, function (e) {
	    	    	if(i > 0) {
	    	    		inClause = inClause + ", ";
	    	    	}
	    	    	inClause = inClause + _prepareOperand(e);
	    	    	i++;
	    	    	
	    	    	return false;
	    	    });
	    	    inClause = inClause + ")";

	    	    var detDesc = tableDesc && tableDesc.details[OracleDB.uq(key)];

	    	    if(detDesc) {
	    	  		// Complex detail field
	    	    	ret = '"_id" IN (SELECT UNIQUE "_id" FROM '+OracleDB.q(detDesc.tableName)+' WHERE "_value" '+inClause+')';
	    	  	} else {
		    	    ret = key + " " + inClause
	    	  	}
	    	    
	    	    return ret;
	      };
	    }
	  },
  $nin: {
		    compileElementSelector: function (operand) {
		      if (!isArray(operand))
		        throw Error("$in needs an array");

		      var elementMatchers = [];
		      _.each(operand, function (option) {
		        if (option instanceof RegExp)
			        throw Error("regexp inside $nin is not supported yet");
		        else if (isOperatorObject(option))
		          throw Error("cannot nest $ under $in");
		        else
		          elementMatchers.push(option);
		      });

		      if(elementMatchers.length === 0) {
		          // throw Error("no values applied to $in");    	  
		    	  // Looks like on the server side $nin: [] should work, at least Telescope produces this query with $in
		    	  // So generate a TRUE expression
		    	  return function(key) {
		    		  return "(1=1)";
		    	  }
		      }
		      return function (key) {
		    	  	var i = 0;
		    	    var ret = key + " NOT IN (";
		    	    _.any(elementMatchers, function (e) {
		    	    	if(i > 0) {
		    	    		ret = ret + ", ";
		    	    	}
		    	    	ret = ret + _prepareOperand(e);
		    	    	i++;
		    	    	
		    	    	return false;
		    	    });
		    	    ret = ret + ")";
		    	    return ret;
		      };
		    }
		  },
  $size: {      
    // {a: [[5, 5]]} must match {a: {$size: 1}} but not {a: {$size: 2}}, so we
    // don't want to consider the element [5,5] in the leaf array [[5,5]] as a
    // possible value.
    dontExpandLeafArrays: true,
    compileElementSelector: function (operand) {
      throw Error("$size operator is not supported yet");
    }
  },
  $type: {
    // {a: [5]} must not match {a: {$type: 4}} (4 means array), but it should
    // match {a: {$type: 1}} (1 means number), and {a: [[5]]} must match {$a:
    // {$type: 4}}. Thus, when we see a leaf array, we *should* expand it but
    // should *not* include it itself.
    dontIncludeLeafArrays: true,
    compileElementSelector: function (operand) {
      throw Error("$type operator is not supported yet");
    }
  },
  $regex: {
    compileElementSelector: function (operand, oracleSelector, valueSelector) {
      if (!(typeof operand === 'string' || operand instanceof RegExp))
        throw Error("$regex has to be a string or RegExp");

      var regexp;
      if (valueSelector.$options !== undefined) {
        if (/[^gim]/.test(valueSelector.$options))
          throw new Error("Only the i, m, and g regexp options are supported");
      
        var regexSource = operand instanceof RegExp ? operand.source : operand;
        regexp = new RegExp(regexSource, valueSelector.$options).toString();
      } else if (operand instanceof RegExp) {
        regexp = operand.toString();
      } else {
        regexp = operand;
      }
      return regexpElementMatcher(regexp);
    }
  },
  $elemMatch: {
    dontExpandLeafArrays: true,
    compileElementSelector: function (operand, oracleSelector, valueSelector, matcher) {
    	return function (key) {
    		var nestedTableName = OracleDB.q(oracleSelector._tableName+"$"+OracleDB.uq(key));
    		
    		return OracleDB.q("_id")+" IN (SELECT DISTINCT "+OracleDB.q("_id")+" FROM "+nestedTableName+" WHERE "+
    		oracleSelector.compileDocumentSelector(operand, matcher, {inElemMatch: true}) + ")";
    	}
    }
  }
};

// NB: We are cheating and using this function to implement "AND" for both
// "document matchers" and "branched matchers". They both return result objects
// but the argument is different: for the former it's a whole doc, whereas for
// the latter it's an array of "branched values".
var operatorMatchers = function (subMatchers, operator) {
  if (subMatchers.length === 0)
    return "";
  if (subMatchers.length === 1)
    return subMatchers[0];

  	var i = 0;
    var ret = "";
    _.all(subMatchers, function (f) {
    	if(f && f !== "") {
        	if(i > 0) {
        		ret = ret + " "+operator+" ";
        	}
        	ret = ret + "(" + f + ")";
        	i++;
    	}
    	return true;
    });

    return ret;
};

var andDocumentMatchers = function(subMatchers) {return operatorMatchers(subMatchers, "AND");};
var orDocumentMatchers = function(subMatchers) {return operatorMatchers(subMatchers, "OR");};

var operatorBranchedMatchers = function (subMatchers, operator) {
	return function f(key) {
	  if (subMatchers.length === 0)
	    return "";
	  if (subMatchers.length === 1)
	    return subMatchers[0](key);

	  	var i = 0;
	    var ret = "";
	    _.all(subMatchers, function (f) {
	    	if(f && f !== "") {
	        	if(i > 0) {
	        		ret = ret + " "+operator+" ";
	        	}
	        	ret = ret + "(" + f(key) + ")";
	        	i++;
	    	}
	    	return true;
	    });

	    return ret;
	}
};

var andBranchedMatchers = function(subMatchers) {return operatorBranchedMatchers(subMatchers, "AND");};
