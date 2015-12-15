OracleModifier = function (modifier, tableName) {
	var self = this;
	
	self._fields = {};
	self._parameters = [];
	self._modifier = modifier;
	self._tableName = tableName;
	self._deferred = [];
	self._setClause = self._compileModifier(modifier);
}

OracleModifier.prototype._prepareOperand = function(operand) {
	var self = this;
	  var ret = null;
	    if (typeof operand === 'boolean') {
	    	ret = operand ? "true" : "false";
	    } else if (typeof operand === 'string') {
	    // 	operand = operand.replace("'", "''");
	    //	ret = "'"+operand+"'";
	    	ret = operand;
	    } else {
	    	ret = operand;
	    }
	    
	    self._parameters.push(ret);
	    
	    return ":"+(self._parameters.length-1);
};

var MODIFIERS = {
  $inc: function (oracleModifier, field, arg) {
    if (typeof arg !== "number")
      throw new Error("Modifier $inc allowed for numbers only");
    
    var s = field + " = " + field;

    if(arg >= 0) {
    	s = s + " + " + oracleModifier._prepareOperand(arg);	
    } else {
    	s = s + " - " + oracleModifier._prepareOperand(-arg);
    }

    return s;
  },
  $set: function (oracleModifier, field, arg) {
	  if(arg instanceof Array) {
		  // Must be embedded item 
	  	  	oracleModifier._deferred.push({op: "delete", table: oracleModifier._tableName+"$"+OracleDB.uq(field)});
		    _.each(arg, function (value) {
		  	  	oracleModifier._deferred.push({op: "insert", table: oracleModifier._tableName+"$"+OracleDB.uq(field), value: value});
		      });
		    
		    return undefined;
	  }
	  
	  var s = field + " = " + oracleModifier._prepareOperand(arg);

	  return s;
  },
  $setOnInsert: function (oracleModifier, field, arg) {
	    throw new Error("$setOnInsert is not supported");

	    var s = field + " = " + oracleModifier._prepareOperand(arg);
		  
		return s;
  },
  $unset: function (oracleModifier, field, arg) {
	  var s = field + " = NULL";
	  return s;
  },
  $push: function (target, field, arg) {
	    throw new Error("$push is not supported");
	    
    if (target[field] === undefined)
      target[field] = [];
    if (!(target[field] instanceof Array))
      throw MinimongoError("Cannot apply $push modifier to non-array");

    if (!(arg && arg.$each)) {
      // Simple mode: not $each
      target[field].push(arg);
      return;
    }

    // Fancy mode: $each (and maybe $slice and $sort and $position)
    var toPush = arg.$each;
    if (!(toPush instanceof Array))
      throw MinimongoError("$each must be an array");

    // Parse $position
    var position = undefined;
    if ('$position' in arg) {
      if (typeof arg.$position !== "number")
        throw MinimongoError("$position must be a numeric value");
      // XXX should check to make sure integer
      if (arg.$position < 0)
        throw MinimongoError("$position in $push must be zero or positive");
      position = arg.$position;
    }

    // Parse $slice.
    var slice = undefined;
    if ('$slice' in arg) {
      if (typeof arg.$slice !== "number")
        throw MinimongoError("$slice must be a numeric value");
      // XXX should check to make sure integer
      if (arg.$slice > 0)
        throw MinimongoError("$slice in $push must be zero or negative");
      slice = arg.$slice;
    }

    // Parse $sort.
    var sortFunction = undefined;
    if (arg.$sort) {
      if (slice === undefined)
        throw MinimongoError("$sort requires $slice to be present");
      // XXX this allows us to use a $sort whose value is an array, but that's
      // actually an extension of the Node driver, so it won't work
      // server-side. Could be confusing!
      // XXX is it correct that we don't do geo-stuff here?
      sortFunction = new Minimongo.Sorter(arg.$sort).getComparator();
      for (var i = 0; i < toPush.length; i++) {
        if (LocalCollection._f._type(toPush[i]) !== 3) {
          throw MinimongoError("$push like modifiers using $sort " +
                      "require all elements to be objects");
        }
      }
    }

    // Actually push.
    if (position === undefined) {
      for (var j = 0; j < toPush.length; j++)
        target[field].push(toPush[j]);
    } else {
      var spliceArguments = [position, 0];
      for (var j = 0; j < toPush.length; j++)
        spliceArguments.push(toPush[j]);
      Array.prototype.splice.apply(target[field], spliceArguments);
    }

    // Actually sort.
    if (sortFunction)
      target[field].sort(sortFunction);

    // Actually slice.
    if (slice !== undefined) {
      if (slice === 0)
        target[field] = [];  // differs from Array.slice!
      else
        target[field] = target[field].slice(slice);
    }
  },
  $pushAll: function (target, field, arg) {
	    throw new Error("$pushAll is not supported");
	    
    if (!(typeof arg === "object" && arg instanceof Array))
      throw MinimongoError("Modifier $pushAll/pullAll allowed for arrays only");
    var x = target[field];
    if (x === undefined)
      target[field] = arg;
    else if (!(x instanceof Array))
      throw MinimongoError("Cannot apply $pushAll modifier to non-array");
    else {
      for (var i = 0; i < arg.length; i++)
        x.push(arg[i]);
    }
  },
  $addToSet: function (oracleModifier, field, arg) {
    var isEach = false;
    if (typeof arg === "object") {
      //check if first key is '$each'
      for (var k in arg) {
        if (k === "$each")
          isEach = true;
        break;
      }
    }
    var values = isEach ? arg["$each"] : [arg];
    _.each(values, function (value) {
  	  	oracleModifier._deferred.push({op: "add", table: oracleModifier._tableName+"$"+OracleDB.uq(field), value: value});
      });
    
	return undefined;
  },
  $pop: function (target, field, arg) {
	  console.log("ERROR: $pop is not supported");
	    throw new Error("$pop is not supported");
	    
    if (target === undefined)
      return;
    var x = target[field];
    if (x === undefined)
      return;
    else if (!(x instanceof Array))
      throw MinimongoError("Cannot apply $pop modifier to non-array");
    else {
      if (typeof arg === 'number' && arg < 0)
        x.splice(0, 1);
      else
        x.pop();
    }
  },
  $pull: function (oracleModifier, field, arg) {
	  oracleModifier._deferred.push({op: "delete", table: oracleModifier._tableName+"$"+OracleDB.uq(field), selector: {_value: arg}});
  },
  $pullAll: function (target, field, arg) {
	  console.log("ERROR: $pullAll is not supported");
	    throw new Error("$pullAll is not supported");
	    
    if (!(typeof arg === "object" && arg instanceof Array))
      throw MinimongoError("Modifier $pushAll/pullAll allowed for arrays only");
    if (target === undefined)
      return;
    var x = target[field];
    if (x === undefined)
      return;
    else if (!(x instanceof Array))
      throw MinimongoError("Cannot apply $pull/pullAll modifier to non-array");
    else {
      var out = [];
      for (var i = 0; i < x.length; i++) {
        var exclude = false;
        for (var j = 0; j < arg.length; j++) {
          if (LocalCollection._f._equal(x[i], arg[j])) {
            exclude = true;
            break;
          }
        }
        if (!exclude)
          out.push(x[i]);
      }
      target[field] = out;
    }
  },
  $rename: function (target, field, arg, keypath, doc) {
	    throw new Error("$rename is not supported");
	    
    if (keypath === arg)
      // no idea why mongo has this restriction..
      throw MinimongoError("$rename source must differ from target");
    if (target === null)
      throw MinimongoError("$rename source field invalid");
    if (typeof arg !== "string")
      throw MinimongoError("$rename target must be a string");
    if (target === undefined)
      return;
    var v = target[field];
    delete target[field];

    var keyparts = arg.split('.');
    var target2 = findModTarget(doc, keyparts, {forbidArray: true});
    if (target2 === null)
      throw MinimongoError("$rename target field invalid");
    var field2 = keyparts.pop();
    target2[field2] = v;
  },
  $bit: function (target, field, arg) {
    // XXX mongo only supports $bit on integers, and we only support
    // native javascript numbers (doubles) so far, so we can't support $bit
    throw new Error("$bit is not supported");
  }
};

OracleModifier.prototype._compileModifier = function(modifier) {
	var self = this;
	
	var s = undefined;
	
	if(!modifier) {
		return s;
	}
	
	for(var mod in modifier) {
		var modv = modifier[mod];
		
		for(var field in modv) {
			var arg = modv[field];
		    
			if(mod === "$unset") {
				arg = null;
			}
			
			var column = OracleDB._columnNameM2O(field);

			column = OracleDB.q(column);

			var ss = MODIFIERS[mod](self, column, arg);
			
			if(ss === undefined) {
				continue;
			}
				
			self._fields[field] = arg;

			if(s === undefined) {
				s = ss;
			} else {
				s = s + ", " + ss;
			}
		}
	}

	return s;
};

OracleModifier._compile = function(modifier) {
	var m = new OracleModifier(modifier);
	
	return m._setClause;
};

OracleModifier._prepare = function(modifier) {
	var mls = {};
	
	if(!modifier) {
		return mls;
	}
	
	for(var fn in modifier) {
		var value = modifier[fn];
		
		if(typeof fn === 'string') {
			var fa = fn.split(".");

			var ml = mls;
			
			for(var i = 0; i < fa.length-1; i++) {
				var fi = fa[i];
				
				if(ml[fi] === undefined) {
					var n = {};
					ml[fi] = n;
					ml = n;
				}
			}
			
			if(ml["."] === undefined) {
				var n = {};
				ml["."] = n;
				ml = n;
			} else {
				ml = ml["."];
			}
			
			ml[fa[fa.length-1]] = value;
		} else {
			// Add field to sls["."]
			var ml = mls["."];
			
			if(ml === undefined) {
				ml = {};
				mls["."] = ml;
			}
			
			ml[fn] = value;
		}		
	}

	return mls;
};

OracleModifier._compilePrepared = function(modifier, tableName) {
	var rs = {};
	for(fn in modifier) {
		var value = modifier[fn];
		
		if(fn === ".") {
			var m = new OracleModifier(value, tableName);
			
			rs[fn] =  m._setClause;
			rs["*"] = m._fields;
			rs["$"] = m._parameters;
			rs["@"] = m._deferred;
		} else {
			var nestedTableName = tableName+"$"+fn;
			
			rs[fn] = OracleModifier._compilePrepared(value, nestedTableName);
		}
	}
	
	return rs;
};

OracleModifier.process = function(modifier, tableName) {
	var m = OracleModifier._prepare(modifier);

	m = OracleModifier._compilePrepared(m, tableName);

	return m;
};

