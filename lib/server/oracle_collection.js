
OracleCollection = function (db, collectionName, oracleOptions) {
	  var self = this;
	  
	  self.db = db;
	  self.collectionName = collectionName;
	  self.oracleOptions = oracleOptions;
	  
	  if(self.oracleOptions.sqlTable === undefined) {
		  self.oracleOptions.sqlTable = self.collectionName;
	  }
	  self.oracleOptions.sql = self.oracleOptions.sql;
};

OracleCollection.prototype.find = function(selector, fields, options) {
	var self = this;

	  if(self.oracleOptions.sqlDebug) {
		  if(self.oracleOptions.sqlTable !== "oplog")
		  console.log("FIND: ", self.oracleOptions.sqlTable, selector, fields, options);		  
	  }
	  
	// Construct the SQL
	var sql = self.oracleOptions.sql;
	var sqlTable = null;
	
	if(!sql) {
		 sqlTable = self.oracleOptions.sqlTable;
		 if(!sqlTable) {
			 throw new Error("Missing sqlTable in oracle options");
		 }
		 sql = "SELECT * FROM " + OracleDB.q(sqlTable);
	}
	
	var sqlParameters = EJSON.clone(self.oracleOptions.sqlParameters) || [];

	if(self.oracleOptions.sqlAddId) {
		sql = "SELECT rownum as "+OracleDB.q("_id")+", c.* FROM ("+sql+") c";
	}
	
	var originalSelector = selector;
	selector = OracleSelector.process(selector, sqlTable, self.db);

	if(selector && selector["."]) {
		var where = selector["."];

		if(where && where !== "") {
			sql = "SELECT * FROM ("+sql+") WHERE "+where;
		}		
	}

	var sorter = undefined;
	var orderBy = "";
	if(options.sort) {
		sorter = OracleSorter.process(options.sort, options);
		orderBy = sorter["."];
	}
	
	if(orderBy && orderBy != "") {
		sql = sql + " ORDER BY " + orderBy;
	}
	
	var cl = OracleFields._prepare(fields);
	
	// Adding fields projection here
	if(cl["."]) {
		var s = OracleFields.getColumnList(self.db._tables[sqlTable], cl["."]);
		sql = "SELECT "+s+" FROM ("+sql+")";
	}
	
	if(options.skip) {
		sql = "SELECT rownum as rowno, c.* FROM ("+sql+") c";
		sql = "SELECT * FROM ("+sql+") WHERE rowno > :skip";
		sqlParameters.push(options.skip);
	}
	
	if(options.limit) {
		sql = "SELECT * FROM ("+sql+") WHERE rownum <= :limit";
		sqlParameters.push(options.limit);
	}
	
	var sql0 = sql;
	
	if(self.oracleOptions.sqlScn) {
		sql = "SELECT * FROM ("+sql+") AS OF SCN :scn";
		sqlParameters.push(self.oracleOptions.sqlScn);
	}
	
	var details = [];
	
	if(sqlTable) {
		var tableDesc = self.db._tables[sqlTable];
		
		self.db._ensureSelectableColumns(sqlTable, selector["*"], self.oracleOptions);

		for(var di in tableDesc.details) {
			var detRec = tableDesc.details[di];
			var detTableName = detRec.tableName;
			
	    	self.db._ensureTable(detTableName, self.oracleOptions);
	    	  
			// Exclude detail if it's not in the field list
			if(fields && fields[detRec.fieldName] !== undefined && !fields[detRec.fieldName]) {
				continue;
			}
			
			var detSql = "SELECT * FROM "+OracleDB.q(detTableName)+" WHERE "+OracleDB.q("_id")+" IN (SELECT "+OracleDB.q("_id")+" FROM ("+sql0+"))";
			var detSqlParameters = [];

			if(selector && selector[detRec.fieldName] && selector[detRec.fieldName]["."]) {
				self.db._ensureSelectableColumns(detTableName, selector[detRec.fieldName]["*"], self.oracleOptions);

				var where = selector[detRec.fieldName]["."];

				if(where && where !== "") {
					detSql = detSql + " AND " + where; 
				}		
			}
			
			if(sorter && sorter[detRec.fieldName] && sorter[detRec.fieldName]["."]) {
				detSql = detSql + " ORDER BY " + sorter[detRec.fieldName]["."] + ", "+OracleDB.q("_id")+", "+OracleDB.q("_indexNo");
			} else {
				detSql = detSql + " ORDER BY "+OracleDB.q("_id")+", "+OracleDB.q("_indexNo");
			}
			
			// Adding fields projection here
			var dcl = cl[detRec.fieldName];
			
			if(dcl && dcl["."]) {
				var s = OracleFields.getColumnList(self.db._tables[detTableName], dcl["."], true);

				detSql = "SELECT "+s+" FROM ("+detSql+")";
			}
			
			for(var i in sqlParameters) {
				detSqlParameters.push(sqlParameters[i]);
			}
			if(self.oracleOptions.sqlScn) {
				detSql = "SELECT * FROM ("+sql+") AS OF SCN :scn";
				detSqlParameters.push(self.oracleOptions.sqlScn);
			}
			details.push({detailRecord: detRec, sql:detSql, sqlParameters:detSqlParameters});			
		}
	};
	
	var dbCursor = new OracleCollection.Cursor(self, sql, sqlParameters, details, originalSelector, fields, options);
	  
	return dbCursor;
};

OracleCollection.prototype.insert = function(doc, options, callback) {
	var self = this;

	  if(self.oracleOptions.sqlDebug) {
		  console.log("INSERT: ", self.oracleOptions.sqlTable, doc, options);
	  }
	  
	var batch = [];
	
	self._insert(doc, self.oracleOptions.sqlTable, options, callback, null, null, null, batch);

	result = self.db.executeBatch(batch, self.oracleOptions);

	if(callback) callback(null, result);

	return result;
};

// makes batch of all inserts to be executed within a single transaction
OracleCollection.prototype._insert = function(doc, sqlTable, options, callback, parentSqlTable, parent_id, index_no, batch) {
	var self = this;
	var cmds = {};
		
	var colList = "";
	var valList = "";
	
	var sqlParameters = [];
	var i = 0;
	var deferred = [];
	
	if(parentSqlTable) {
		colList = OracleDB.q("_id")+", "+OracleDB.q("_indexNo");
		valList = ":0, :1";
		sqlParameters.push(parent_id);
		sqlParameters.push(index_no);
		i = 2;
	}
	
	for(var column in doc) {
		var value = doc[column];
		
		if(value instanceof Array) {
			var sqlTable2 = sqlTable + "$" + OracleDB._tableNameM2O(column);
			
			// Detail table
			for(var index in value) {
				var doc2 = value[index];
				
				if(doc2 instanceof Object) {
					// Standard situation
				} else if(doc2 instanceof Array) {
					throw new Error("Embedded arrays are not supported.")
				} else {
					doc2 = {"_value": doc2};
				}
				deferred.push([doc2, sqlTable2, options, null, sqlTable, doc["_id"], index, batch]);				
			}
			continue;
		} else if(value instanceof Date) {
			// Fall through
		} else if(value instanceof Object) {
			var sqlTable2 = sqlTable + "$" + OracleDB._tableNameM2O(column);
			
			deferred.push([value, sqlTable2, options, null, sqlTable, doc["_id"], 0, batch]);				
			continue;
		}
		
		column = OracleDB._columnNameM2O(column);

		column = OracleDB.q(column);

		if(i > 0) {
			colList = colList + ", ";
			valList = valList + ", ";
		}
		colList = colList + column;
		valList = valList + ":" + i;
		if(typeof value === 'boolean') {
			if(value === true) {
				value = self.oracleOptions.booleanTrueValue;				
			} else if(value === false) {
				value = self.oracleOptions.booleanFalseValue;
			}
		}
		sqlParameters.push(value);
		i++;
	}

	var sql = "INSERT INTO "+OracleDB.q(sqlTable)+" ("+colList+") VALUES ("+valList+")" 

	self.db._ensureColumns(sqlTable, doc, self.oracleOptions, parentSqlTable, true);
	
	batch.push({sql: sql, sqlParameters: sqlParameters});
	
	// Process deferred details
	for(var di in deferred) {
		var dvi = deferred[di];
		OracleCollection.prototype._insert.apply(self, dvi);
	}	
};

OracleCollection.prototype.remove = function(selector, options, callback) {
	var self = this;

	  if(self.oracleOptions.sqlDebug) {
		  console.log("REMOVE: ", self.oracleOptions.sqlTable, selector, options);
	  }
	
	var sqlTable = self.oracleOptions.sqlTable;
	if(!sqlTable) {
		 throw new Error("Missing sqlTable in oracle options for remove operation");
	}
	var sql = "DELETE FROM " + OracleDB.q(sqlTable);
	
	var sqlParameters = [];
	
	selector = OracleSelector.process(selector, sqlTable, self.db);

	if(selector && selector["."]) {
		var where = selector["."];
		
		if(where && where !== "") {
			sql = sql+" WHERE "+where;
		}		
	}

	self.db._ensureSelectableColumns(sqlTable, selector["*"], self.oracleOptions);
	
	var result = self.db.executeCommand(sql, sqlParameters, self.oracleOptions);
	
	if(callback) {
		callback(null, result);
	}
	
	return result;
};

OracleCollection.prototype.update = function(selector, modifier, options, callback) {
	var self = this;
	var result = undefined;
	
	  if(self.oracleOptions.sqlDebug) {
		  console.log("UPDATE: ", self.oracleOptions.sqlTable, selector, modifier, options);
	  }
	
	var sqlTable = self.oracleOptions.sqlTable;
	if(!sqlTable) {
		 throw new Error("Missing sqlTable in oracle options for remove operation");
	}
	
	modifier = OracleModifier.process(modifier, sqlTable);
	
	selector = OracleSelector.process(selector, sqlTable, self.db);

	var batch = [];
	
	if(modifier && modifier["."]) {
		var sql = "UPDATE " + OracleDB.q(sqlTable) + " SET ";
		
		sql = sql + modifier["."];
		
		var sqlParameters = modifier["$"];
		
		if(selector && selector["."]) {
			var where = selector["."];

			if(where && where !== "") {
				sql = sql+" WHERE "+where;
			}		
		}

		self.db._ensureColumns(sqlTable, modifier["*"], self.oracleOptions);
		self.db._ensureSelectableColumns(sqlTable, selector["*"], self.oracleOptions);

		batch.push({sql: sql, sqlParameters: sqlParameters});
	}

	// Process deferred operations
	if(modifier && modifier["@"]) {
		var ops = modifier["@"];
		
		// TODO: make sure all these deferred operation are executed in a single transaction
		for(var i = 0; i < ops.length; i++) {
			var op = ops[i];
			
			if(op.op === "insert") {
				var maxSql = '(SELECT NVL(MAX("_indexNo"), -1)+1 as "_indexNo" FROM ' +
				OracleDB.q(op.table) +
				' "_detail" WHERE "_detail"."_id" = "_master"."_id")'; 
				var sql = "INSERT INTO " + OracleDB.q(op.table) +
				'("_id", "_indexNo", "_value")' +
				' SELECT "_master"."_id" as "_id", '+maxSql+' as "_indexNo", :0 as "_value" FROM ';
				
				sql = sql + '(SELECT "_id" FROM ' + OracleDB.q(sqlTable);
				
				if(selector && selector["."]) {
					var where = selector["."];

					if(where && where !== "") {
						sql = sql+" WHERE "+where;
					}		
				}
				
				sql = sql + ') "_master"';
				
				var sqlParameters = [op.value];
				
				self.db._ensureTable(op.table, self.oracleOptions, sqlTable);
				self.db._ensureColumns(op.table, {_value: op.value}, self.oracleOptions);
				
				batch.push({sql: sql, sqlParameters: sqlParameters});
			} else if(op.op === "add") {
				var maxSql = '(SELECT NVL(MAX("_indexNo"), -1)+1 as "_indexNo" FROM ' +
				OracleDB.q(op.table) +
				' "_detail" WHERE "_detail"."_id" = "_master"."_id")'; 
				var sql = "INSERT INTO " + OracleDB.q(op.table) +
				'("_id", "_indexNo", "_value")' +
				' SELECT "_master"."_id" as "_id", '+maxSql+' as "_indexNo", :0 as "_value" FROM ';
				
				sql = sql + '(SELECT "_id" FROM ' + OracleDB.q(sqlTable);
				
				if(selector && selector["."]) {
					var where = selector["."];

					if(where && where !== "") {
						sql = sql+" WHERE "+where;
					}		
				}
				
				sql = sql + ') "_master"';
				sql = sql + ' WHERE NOT EXISTS ' +
				'(SELECT 1 FROM ' +
				OracleDB.q(op.table) +
				' "_detail" WHERE "_detail"."_id" = "_master"."_id" and "_detail"."_value" = :1)';
				
				var sqlParameters = [op.value, op.value];
				
				self.db._ensureTable(op.table, self.oracleOptions, sqlTable);
				self.db._ensureColumns(op.table, {_value: op.value}, self.oracleOptions);
				
				batch.push({sql: sql, sqlParameters: sqlParameters});
			} else if(op.op === "delete") {

				var sql = "DELETE FROM " + OracleDB.q(op.table) + ' WHERE "_id" IN ';
				sql = sql + '(SELECT "_id" FROM ' + OracleDB.q(sqlTable);
				
				if(selector && selector["."]) {
					var where = selector["."];

					if(where && where !== "") {
						sql = sql+" WHERE "+where;
					}		
				}
				
				sql = sql + ')';
				
				if(op.selector) {
					var innerSelector = OracleSelector.process(op.selector, op.table, self.db);
					
					if(innerSelector && innerSelector["."]) {
						sql = sql + " AND " + innerSelector["."]; 
					}
				}

				var sqlParameters = [];
				
				self.db._ensureTable(op.table, self.oracleOptions, sqlTable);
				
				batch.push({sql: sql, sqlParameters: sqlParameters});
			} else {
				throw new Error("OracleCollection.update: Unknown deferred operation: "+ op.op);
			}
		}
	}
	
	result = self.db.executeBatch(batch, self.oracleOptions);

	if(callback) callback(null, result);
	
	return result;
};

OracleCollection.Cursor = function (collection, sql, sqlParameters, details, selector, fields, options) {
	  var self = this;
	  self.collection = collection;
	  self.sql = sql;
	  self.sqlParameters = sqlParameters;
	  self.details = details;
	  
	  self._selector = selector;
	  self._field = fields;
	  self._options = options;
	  
	  self.objects = null;
	  self.nextObjectIndex = 0;
	  self.loaded = false;
};

OracleCollection.Cursor.prototype.nextObject = function (callback) {
	  var self = this;
	  var err = null;
	  var r = null;
	  
	  if(!self.loaded) {
		  self._loadObjects();
		  self.loaded = true;
	  }
	  
	  if(self.nextObjectIndex < self.objects.length) {
		  r = self.objects[self.nextObjectIndex++];
	  }
	  
	  callback(err, r);
};

OracleCollection.Cursor.prototype.count = function (callback) {
	  var self = this;
	  var err = null;
	  var cnt = null;
	  
	  if(!self.loaded) {
		  err = self._loadObjects();
		  self.loaded = true;
	  }
	  
	  cnt = self.objects.length;
	  
	  callback(err, cnt);
};

OracleCollection.Cursor.prototype.rewind = function () {
	  var self = this;
	  
	  self.loaded = false;
	  self.objects = [];
	  self.nextObjectIndex = 0;
};

OracleCollection.Cursor.prototype._loadObjects = function () {
	  var self = this;

	  var result = undefined;
	  
	  try {
		  result = self.collection.db.executeCommand(self.sql, self.sqlParameters, self.collection.oracleOptions);
	  } catch(ex) {
		console.log("ERROR in FIND: ", {selector: self._selector, fields: self._fields, options: self._options});
		throw ex;  
	  }
	  
	  self.objects = result.records;
	  
	  if(self.details && self.details.length > 0) {
		  // Make an inverted map of records
		  var recMap = {};
		  for(var i in self.objects) {
			  var rec = self.objects[i];
			  
			  recMap[rec._id] = rec;
		  }
		  
		  for(var i in self.details) {
			  var detail = self.details[i];
			  var detailCursor = new OracleCollection.Cursor(self.collection, detail.sql, detail.sqlParameters, null);
			  detailCursor._loadObjects();
			  for(var obji in detailCursor.objects) {
				  var objRec = detailCursor.objects[obji];

				  var targetRec = recMap[objRec._id];
				  if(!targetRec) {
					  throw new Error("Queries with nested data must include _id field, SQL="+self.sql);
					  continue;
				  }
				  var detField = detail.detailRecord.fieldName;
				  var targetField = targetRec[detField];
				  if(!targetField) {
					  targetField = [];
					  targetRec[detField] = targetField;
				  }
				  
				  delete objRec._id;
				  delete objRec._indexNo;
				  
				  var cnt = Object.keys(objRec).length;
				  if(cnt === 0) {
					  continue;
				  }
				  
				  if(objRec._value !== undefined && cnt === 1) {
					  objRec = objRec._value;
				  }
				  targetField.push(objRec);
			  }
		  }
	  }
};

OracleCollection.prototype.drop = function(callback) {
	var self = this;

	var sqlTable = self.oracleOptions.sqlTable;
	if(!sqlTable) {
		 throw new Error("Missing sqlTable in oracle options for drop operation");
	}
		
	var tableDesc = self.db._tables[sqlTable];
	
	var detResults = [];
	
	for(var di in tableDesc.details) {
		var detRec = tableDesc.details[di];
		var detTableName = detRec.tableName;
		
		var oracleOptions = EJSON.clone(self.oracleOptions);
		delete oracleOptions.sqlTable;
		
		var detColl = self.db.collection(detTableName, oracleOptions);
		var result = detColl.drop();
		
		detResults.push(result);
	}
	
	delete self.db._tables[sqlTable];
	
	var sql = "DROP TABLE " + OracleDB.q(sqlTable);
	
	var sqlParameters = [];
	
	var result = self.db.executeCommand(sql, sqlParameters, self.oracleOptions);

	result.detResults = detResults;
	
	if(callback) {
		callback(null, result);
	}
	
	return result;
};

OracleCollection.prototype._ensureIndexPrepared = function(sqlTable, cl, options) {
	var self = this;
	var results = {};
	
	for(fn in cl) {
		var value = cl[fn];
		
		if(fn === ".") {
			self.db._ensureSelectableColumns(sqlTable, value, self.oracleOptions)
			
			var tableDesc = self.db._tables[sqlTable];
			
			var s = OracleFields.getIndexColumnList(tableDesc, cl["."], false, true);
			
			if(!s) {
				continue;
			}

			var ids = OracleFields.getColumnIdList(tableDesc, cl["."]);
			var indexName = sqlTable+"_I"+ids;
			
			if(tableDesc.indexes[indexName]) {
				// Index already exists, check its status
				if(tableDesc.indexes[indexName].status === "VALID") {
					continue;
				} else {
					var sql = "DROP INDEX "+OracleDB.q(indexName);
					var sqlParameters = [];
					
					results[fn] = self.db.executeCommand(sql, sqlParameters, self.oracleOptions);					
				}
			}
			
			var sql = "CREATE "+(options.bitmap?"BITMAP ":"")+(options.unique?"UNIQUE ":"")+"INDEX "+OracleDB.q(indexName)+" ON "+OracleDB.q(sqlTable)+"("+s+")";
			var sqlParameters = [];
				
			results[fn] = self.db.executeCommand(sql, sqlParameters, self.oracleOptions);

			self.db._refreshTable(sqlTable, self.oracleOptions);
		} else {
			var nestedTableName = sqlTable + "$" + fn;
			
			results[fn] = self._ensureIndexPrepared(nestedTableName, value, options);
		}
	}
	
	return results;
};

OracleCollection.prototype.ensureIndex = function(fields, options, callback) {
	var self = this;
	options = options || {};

	var sqlTable = self.oracleOptions.sqlTable;
	if(!sqlTable) {
		 throw new Error("Missing sqlTable in oracle options for drop operation");
	}
	
	var results = [];
	var cl = OracleFields._prepare(fields);

	self._ensureIndexPrepared(sqlTable, cl, options);	

	if(callback) {
		callback(null, results);
	}
};

OracleCollection.prototype._dropIndexPrepared = function(sqlTable, cl) {
	var self = this;
	var results = {};
	
	for(fn in cl) {
		var value = cl[fn];
		
		if(fn === ".") {
			var tableDesc = self.db._tables[sqlTable];
			var s = OracleFields.getIndexColumnList(tableDesc, cl["."], false, true);		

			if(!s) {
				continue;
			}

			var ids = OracleFields.getColumnIdList(tableDesc, cl["."]);
			var indexName = sqlTable+"_I"+ids;
			
			if(s && tableDesc.indexes[indexName]) {
				// Index exists, remove
				var sql = "DROP INDEX "+OracleDB.q(indexName);
				var sqlParameters = [];
					
				results[fn] = self.db.executeCommand(sql, sqlParameters, self.oracleOptions);					
				self.db._refreshTable(sqlTable, self.oracleOptions);
			}			
		} else {
			var nestedTableName = sqlTable + "$" + fn;
			
			results[fn] = self._dropIndexPrepared(nestedTableName, value);
		}
	}
	
	return results;
};

OracleCollection.prototype.dropIndex = function(fields, callback) {
	var self = this;
	options = options || {};

	var sqlTable = self.oracleOptions.sqlTable;
	if(!sqlTable) {
		 throw new Error("Missing sqlTable in oracle options for drop operation");
	}
	
	var results = [];
	var cl = OracleFields._prepare(fields);

	self._dropIndexPrepared(sqlTable, cl);	

	if(callback) {
		callback(null, results);
	}
};
