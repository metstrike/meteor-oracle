var path = Npm.require('path');
var Fiber = Npm.require('fibers');
var Future = Npm.require(path.join('fibers', 'future'));

OracleDB = function (connection) {
	  var self = this;
	  
	  self.connection = connection;
	  self.db = NpmModuleOracledb;
	  self.db.maxRows = 1000;
	  self.db.prefetchRows = 100;
	  self.db.autoCommit = true;
	  self._tables = {};
};

OracleDB._databases = {};

OracleDB.getDatabase = function(connection) {
	var key = connection.user+"@"+connection.connectString;
	var db = OracleDB._databases[key];
	
	if(!db) {
		var user = OracleDB.executeCommand(connection, "select * from user_users", [], {});
		
		db = new OracleDB(connection);
		db.user = user;
		db.databaseName = key;
		OracleDB._databases[key] = db;
	}

	return db;
};

OracleDB.q = function(name) {
	return '"'+name+'"';
};

OracleDB.uq = function(name) {
	return name.substr(1, name.length-2);
};

// Meteor -> Oracle
OracleDB._tableNameM2O = function(name) {
	return name;
};

OracleDB._columnNameM2O = function(name) {
	return name;
};

//Oracle -> Meteor
OracleDB._tableNameO2M = function(name) {
	return name;
};

OracleDB._columnNameO2M = function(name) {
	return name;
};


OracleDB._processResult = function(sqlOptions, result) {
	var md = result.metaData;
	var rows = result.rows;
	var records = [];
	var nameMap = {};

	if(md && rows) {
		for (var i = 0; i < rows.length; i++) {
			  var row = rows[i];
			  var rec = {};
			  for(var j = 0; j < md.length; j++) {
				  var mdrec = md[j];
				  var val = row[j];
				  
				  // Turn null into undefined so $exist work properly in minimongo
				  if(val === null) {
					  continue;
				  }
				  
				  if(sqlOptions.booleanTrueValue !== undefined) {
					  if(val === sqlOptions.booleanTrueValue) {
						  val = true;
					  } else if(val === sqlOptions.booleanFalseValue) {
						  val = false;
					  }
				  }
				  var name = mdrec['name'];
				  
				  var name2 = nameMap[name];
				  if(!name2) {
					  var name2 = OracleDB._columnNameO2M(name);
					  nameMap[name] = name2;
				  }
				  rec[name2] = val;
			  }
			  records.push(rec);
		}
		
		result.records = records;
		delete result.rows;
	}

	return result;
}

OracleDB.executeCommand = function(connection, sql, sqlParameters, sqlOptions) {
	  sqlParameters = sqlParameters || {};
	  sqlOptions = sqlOptions || {};
	  
	  var future = new Future;
	  var onComplete = future.resolver();

	  try
	  {
		  NpmModuleOracledb.getConnection(
			    connection,
			    Meteor.bindEnvironment(
			  
			    function (err, db) {
			        if (err) {
			          onComplete(err);
			          return;
			        }
			        
			        if(sqlOptions.sqlDebug) {
			        	if(sql.indexOf("SELECT * FROM \"oplog\"") < 0) {
			        	console.log(sql, sqlParameters);
			        	}
			        }
			        
			  	  	db.execute(
					      sql,
					      sqlParameters,
					      sqlOptions,
					      function(err, result) {
					    	  
							  db.release(
					    			  function(err2) {
					    			      if (err2) {
					    			    	  console.error(err2.message);
					    			    	  onComplete(err2, result);
					    			      } else {
					    			    	  onComplete(err, result);
					    			      }
					    			  });					    	  
						  }
					      );
			      },
			      onComplete  // onException
			    )
			  );
	  }
	  catch(ex)
	  {
		  console.error("ERROR in SQL preparation: "+sql);
		  throw ex;
	  }

	  try
	  {
		  var result = future.wait();
		  result = OracleDB._processResult(sqlOptions, result);
		  return result;
	  }
	  catch(ex)
	  {
		  console.error("ERROR in SQL: ", sql);
		  console.error("ERROR MESSAGE: ", ex.message);
		  throw ex;
	  }
};

OracleDB.prototype.executeCommand = function(sql, sqlParameters, sqlOptions) {
	var self = this;
	
	return OracleDB.executeCommand(self.connection, sql, sqlParameters, sqlOptions);
};

OracleDB.executeBatch = function(connection, batch, sqlOptions) {
	  sqlOptions = sqlOptions || {};
	  
	  var future = new Future;
	  var onComplete = future.resolver();

	  try
	  {
		  NpmModuleOracledb.getConnection(
			    connection,
			    Meteor.bindEnvironment(
			  
			    function (err, db) {
			        if (err) {
			          onComplete(err);
			          return;
			        }
			        
			  	  	var results = [];
			  	  	
			    	try
			    	{
			  	  	// For each SQL in the batch
			        for(var bi = 0; bi < batch.length; bi++) {
			        	var bv = batch[bi];
			        	
				        if(sqlOptions.sqlDebug) {
				        	console.log("BATCH ITEM["+bi+"]", bv.sql, bv.sqlParameters);
				        }
				        
				  	  	var future2 = new Future;
				  	  	var onComplete2 = future2.resolver();
				  	  	
				  	  	db.execute(
						      bv.sql,
						      bv.sqlParameters,
						      {autoCommit: false},
						      function(err, result) {
						    	  if(err) {
						    		  console.log("BATCH ["+bi+"] EXECUTED WITH ERROR: ", err.message, bv);
						    	  }
								  onComplete2(err, result);
							  	}
						      );

				  	  	var result = future2.wait();
				  	  	results.push(result);
			        }

			  	  	var commitFuture = new Future;
			  	  	var onCommitComplete = commitFuture.resolver();

			        db.commit(function(err2){
	        			if (err2) {
	        				console.error("BATCH COMMIT FAILED: ", err2.message);
	        				err = err || err2;
	        			}
	        			
	        			onCommitComplete(err2, null);
			        });
			        
			    	commitFuture.wait();
			    	}
			    	catch(e) {
			    		err = err || e;

				  	  	var rollbackFuture = new Future;
				  	  	var onRollbackComplete = rollbackFuture.resolver();

			    		db.rollback(function(err2){
		        			if (err2) {
		        				console.error("BATCH ROLLBACK FAILED: ", err2.message);
		        				err = err || err2;
		        			}
		        			
		        			onRollbackComplete(err2, null);
				        });
			    		
			    		rollbackFuture.wait();
			    	}
			    	finally {
			        db.release(
			        		function(err2) {
			        			if (err2) {
			        				console.error("BATCH CONNECTION RELEASE ERROR:", err.message);
			        				err = err || err2;
			        			}
			        			
			        			// Big return!!!
								onComplete(err, results);
			    			});
			    	}
			      },
			      onComplete  // onException
			    )
			  );
	  }
	  catch(ex)
	  {
		  console.error("ERROR in SQL BATCH preparation: "+batch);
		  throw ex;
	  }

	  try
	  {
		  var result = future.wait();
		  
		  for(var i = 0; i < result.length; i++) {
			  result[i] = OracleDB._processResult(sqlOptions, result[i]);
		  }
		  
		  return result;
	  }
	  catch(ex)
	  {
		  console.error("ERROR in SQL BATCH: "+ex.message);
		  throw ex;
	  }
};

OracleDB.prototype.executeBatch = function(batch, sqlOptions) {
	var self = this;
	
	return OracleDB.executeBatch(self.connection, batch, sqlOptions);
};

OracleDB.prototype._getJsonColumns = function(sqlTable, op, oracleOptions, o) {
	var self = this;
	var tableResult = self._tables[sqlTable];
	var columns = tableResult["columns"];
	var s = "";
	var nested = sqlTable.indexOf("$") >= 0;
	
	var i = 0;
	var nw = ":NEW";
	if(op === 'w' || op === 'd') {
		nw = ":OLD";
	}
	
	for(var c in columns) {
		var cv = columns[c];
		
		if(op === 'u' && c === "_id") continue; // exclude for updates
		if(op === 'w' || op === 'd') {
			if(!(c === "_id" || c === "_value")) {
				continue;
			}
		}
		if (i > 0) {
			s = s + "\n";
		}
		s = s + "\t\t";
		
		if(op === 'u') {
			s = s + 'IF ('+nw+'."'+c+'" <> :OLD."'+c+'" OR ('+nw+'."'+c+'" IS NOT NULL AND :OLD."'+c+'" IS NULL) OR ('+nw+'."'+c+'" IS NULL AND :OLD."'+c+'" IS NOT NULL)) THEN ';
			s = s + "IF "+o+" is not null THEN "+o+" := "+o+" || ', '; END IF; ";
		} else {
			if(i > 0) {
				s = s + o+" := "+o+" || ', ';\n\t\t";
			}
		}
		
		s = s + o+" := "+o+" || ";

		if(cv.isBoolean) {
			s = s + '\'"'+c+'": \'||nvl('+nw+'."'+c+'", \'null\')';
		} else if(cv.dataType === 'VARCHAR2') {
			s = s + '\'"'+c+'": "\'||replace(replace('+nw+'."'+c+'", chr(10), \'\\n\'), \'"\', \'\\"\')||\'"\'';
		} else if(cv.dataType === 'NUMBER') {
			s = s + '\'"'+c+'": \'||nvl(meteor_pkg.js_number('+nw+'."'+c+'"), \'null\')';			
		} else if(cv.dataType === 'DATE') {
			s = s + '\'"'+c+'": {"$date": "\'||to_char('+nw+'."'+c+'", \'yyyy-mm-dd"T"hh24:mi:ss".000Z"\')||\'"}\'';		
		} else if(cv.dataType === 'TIMESTAMP') {
			s = s + '\'"'+c+'": {"$date": "\'||to_char('+nw+'."'+c+'", \'yyyy-mm-dd"T"hh24:mi:ss.ff3"Z"\')||\'"}\'';		
		}
		
		if(op === 'u') {
			s = s + '; END IF';
		}
		s = s + ';';
		i++;
	}
	
	return i === 0 ? null : s;
};

OracleDB.prototype._refreshTable = function(sqlTable, oracleOptions) {
	  var self = this;
	  var tableResult = self._tables[sqlTable];
	  
	  if(!tableResult) {
		  var tableSql = 'select table_name as "tableName", status, num_rows as "numRows" from user_tables where table_name = :1';
		  var tableResult = self.executeCommand(tableSql, [sqlTable])
	  
	  	  if(!tableResult.records || tableResult.records.length === 0) {
	  		  // Table does not exist in the database
	  		  return;
	  	  }
	  	  
	  	  self._tables[sqlTable] = tableResult;
	  }
	  
	  var colSql = 'select column_name as "columnName", column_id as "columnId", data_type as "dataType", data_length as "dataLength", data_precision as "dataPrecision", data_scale as "dataScale", nullable as "nullable", default_length as "defaultLength" from user_tab_columns where table_name = :1 order by column_id';
	  var colResult = self.executeCommand(colSql, [sqlTable], oracleOptions)
	  var columns = {};
	  var ccn = {};
	  for(var i = 0; i < colResult.records.length; i++) {
		  var rec = colResult.records[i];

		  var oraColumn = rec.columnName;
		  var meteorColumn = OracleDB._columnNameO2M(oraColumn);
		  columns[oraColumn] = rec;
		  rec["meteorName"] = meteorColumn;
		  ccn[meteorColumn] = oraColumn;
	  }
	  tableResult["colRecords"] = colResult.records;
	  tableResult["columns"] = columns;
	  tableResult["ccn"] = ccn;
	  
	  var consSql = 'select constraint_name as "constraintName", constraint_type as "constraintType" from user_constraints where table_name = :1 and status = \'ENABLED\' and invalid is null';
	  var consResult = self.executeCommand(consSql, [sqlTable], oracleOptions)
	  var constraints = {};
	  for(var i = 0; i < consResult.records.length; i++) {
		  var rec = consResult.records[i];
		  var s = sqlTable+'_BOOL_CHK';

		  if(rec.constraintName.substr(0, s.length) == s) {
			  // It's boolean check!
			  var index = rec.constraintName.substr(s.length);
			  tableResult.colRecords[index-1]["isBoolean"] = true;
		  }
		  s = sqlTable+"_NULL_CHK";
		  if(rec.constraintName.substr(0, s.length) == s) {
			  // It's null check!
			  var index = rec.constraintName.substr(s.length);
			  tableResult.colRecords[index-1]["isNull"] = true;
		  }
	  }
	  tableResult["consRecords"] = consResult.records;
	  
	  var indSql = 'select index_name as "indexName", index_type as "indexType", uniqueness as "uniqueness", status as "status", compression as "compression" from user_indexes where table_name = :1';
	  var indResult = self.executeCommand(indSql, [sqlTable], oracleOptions)
	  var indexes = {};
	  for(var i = 0; i < indResult.records.length; i++) {
		  var rec = indResult.records[i];
		  indexes[rec.indexName] = rec;
	  }
	  tableResult["indexes"] = indexes;
	  // tableResult["indResult"] = indResult;
	  
	  var detSql = 
		  'select table_name as "tableName", substr(table_name, length(:0)+2) as "fieldName" from user_constraints '+
		  "where table_name like :1||'$%' and constraint_type='R' " +
		  "and r_constraint_name in " +
		  "(select constraint_name from user_constraints where constraint_type in ('P','U') and table_name=:2) ";

	  var detResult = self.executeCommand(detSql, [sqlTable, sqlTable, sqlTable], oracleOptions)
	  var details = {};
	  for(var key in detResult.records) {
		  var rec = detResult.records[key];
		  details[OracleDB._columnNameO2M(rec.fieldName)] = {tableName: OracleDB._tableNameO2M(rec.tableName), fieldName: OracleDB._columnNameO2M(rec.fieldName)};
	  }
	  tableResult["details"] = details;

	  for(var di in details) {
		  self._ensureTable(details[di].tableName, oracleOptions, sqlTable);
	  }
	  
	  var nested = sqlTable.indexOf("$") >= 0;
	  
	  // Create or Replace the Trigger
	  if(sqlTable !== 'oplog') {
	  var trgSql = 'create or replace trigger "'+sqlTable+'_trg"\n';
	  trgSql = trgSql + "after insert or update or delete\n"; 
	  trgSql = trgSql + 'on "' + sqlTable + '"\n';
	  trgSql = trgSql + "for each row\n";
	  trgSql = trgSql + "declare\n";
	  trgSql = trgSql + "\top varchar2(1);\n";
	  trgSql = trgSql + "\tns varchar2(200);\n";
	  trgSql = trgSql + "\to varchar2(4000);\n";
	  trgSql = trgSql + "\to2 varchar2(4000);\n";
	  trgSql = trgSql + "begin\n";
	  trgSql = trgSql + "\tIF INSERTING THEN\n";
	  trgSql = trgSql + "\t\top := 'i';\n";
	  trgSql = trgSql + "\t\tns := 'meteor@localhost/XE'||'.'||'"+sqlTable+"';\n";
	  trgSql = trgSql + "\t\to := '';\n";
	  trgSql = trgSql + self._getJsonColumns(sqlTable, 'i', oracleOptions, "o") + "\n";
	  trgSql = trgSql + "\t\to := '{'||o||'}';\n";
	  trgSql = trgSql + "\t\to2 := null;\n";
	  trgSql = trgSql + '\t\tinsert into "oplog" ("id", "ts", "scn", "tr", "v", "op", "ns", "o", "o2")\n'
	  trgSql = trgSql + '\t\tvalues ("oplog_seq".nextval, current_timestamp, dbms_flashback.get_system_change_number, dbms_transaction.local_transaction_id, 2, op, ns, o, o2);\n';	  
	  trgSql = trgSql + "\tELSIF UPDATING THEN\n";
	  trgSql = trgSql + "\t\top := 'u';\n";
	  trgSql = trgSql + "\t\tns := 'meteor@localhost/XE'||'.'||'"+sqlTable+"';\n";
	  var cl = self._getJsonColumns(sqlTable, 'u', oracleOptions, "o");
	  if(cl) {
	  trgSql = trgSql + "\t\to := '';\n"
	  trgSql = trgSql + cl + "\n";
	  trgSql = trgSql + "\t\tIF o is not null THEN\n";	  
	  trgSql = trgSql + "\t\t\to := '{\"$set\": {'||o||'}}';\n";
	  trgSql = trgSql + "\t\to2 := '';\n";
	  trgSql = trgSql + self._getJsonColumns(sqlTable, 'w', oracleOptions, "o2") + "\n";
	  trgSql = trgSql + "\t\to2 := '{'||o2||'}';\n";
	  trgSql = trgSql + '\t\t\tinsert into "oplog" ("id", "ts", "scn", "tr", "v", "op", "ns", "o", "o2")\n';
	  trgSql = trgSql + '\t\t\tvalues ("oplog_seq".nextval, current_timestamp, dbms_flashback.get_system_change_number, dbms_transaction.local_transaction_id, 2, op, ns, o, o2);\n';
	  trgSql = trgSql + "\t\tEND IF;\n";
	  }
	  trgSql = trgSql + "\tELSIF DELETING THEN\n";
	  trgSql = trgSql + "\t\top := 'd';\n";
	  trgSql = trgSql + "\t\tns := 'meteor@localhost/XE'||'.'||'"+sqlTable+"';\n";
	  trgSql = trgSql + "\t\to := '';\n";
	  trgSql = trgSql + self._getJsonColumns(sqlTable, 'w', oracleOptions, "o") + "\n";
	  trgSql = trgSql + "\t\to := '{'||o||'}';\n";
	  trgSql = trgSql + "\t\to2 := null;\n";	  
	  trgSql = trgSql + '\t\tinsert into "oplog" ("id", "ts", "scn", "tr", "v", "op", "ns", "o", "o2")\n';
	  trgSql = trgSql + '\t\tvalues ("oplog_seq".nextval, current_timestamp, dbms_flashback.get_system_change_number, dbms_transaction.local_transaction_id, 2, op, ns, o, o2);\n';
	  trgSql = trgSql + "\tEND IF;\n";
	  trgSql = trgSql + " end;\n";
	  var trgResult = self.executeCommand(trgSql, [], oracleOptions)
	  }
};

OracleDB.prototype._ensureTable = function(sqlTable, oracleOptions, parentSqlTable) {
	  var self = this;
	  
	  if(!self._tables[sqlTable]) {
		  self._refreshTable(sqlTable, oracleOptions);
		  
		  if(!self._tables[sqlTable]) {
	  		  // Table doesn't exist, we should create it
	  		  var sql;
	  		  var result;
	  		  
	    	  if(parentSqlTable) {
	    		  sql = "create table "+OracleDB.q(sqlTable)+" ("+OracleDB.q("_id")+" varchar2(17) not null, "+OracleDB.q("_indexNo")+" number(20, 0) not null)";
	    	  } else {
	    		  sql = "create table "+OracleDB.q(sqlTable)+" ("+OracleDB.q("_id")+" varchar2(17) not null)";	    		  
	    	  }
	  		  if(oracleOptions.sqlDebug) {
	  			  console.log(sql);
	  		  };
	  		  
	    	  result = self.executeCommand(sql, []);

    		  // Add a primary key
	    	  if(parentSqlTable) {
	    		  sql = "alter table "+OracleDB.q(sqlTable)+" add constraint "+OracleDB.q(sqlTable+"_PK")+" primary key ("+OracleDB.q("_id")+", "+OracleDB.q("_indexNo")+")";
	    	  } else {
		  		  sql = "alter table "+OracleDB.q(sqlTable)+" add constraint "+OracleDB.q(sqlTable+"_PK")+" primary key ("+OracleDB.q("_id")+")";
	    	  }
	  		  if(oracleOptions.sqlDebug) {
	  			  console.log(sql);
	  		  };
	  		  result = self.executeCommand(sql, []);		    	  

    		  // Add a foreign key
	    	  if(parentSqlTable) {
	    		  sql = "alter table "+OracleDB.q(sqlTable)+" add constraint "+OracleDB.q(sqlTable+"_FK")+" foreign key ("+OracleDB.q("_id")+") references "+OracleDB.q(parentSqlTable)+"("+OracleDB.q("_id")+") on delete cascade";
	    		  if(oracleOptions.sqlDebug) {
	    			  console.log(sql);
	    		  };
	    		  result = self.executeCommand(sql, []);
	    	  }
	    	  
	    	  // Verify, that the table has been created
			  self._refreshTable(sqlTable, oracleOptions);
			  if(!self._tables[sqlTable]) {
	    		  throw new Error("Table creation failed");
	    	  }
	  	  }
	  	  	    		  
	  	  if(parentSqlTable) {
	  		  self._refreshTable(parentSqlTable, oracleOptions);
	  	  }
	  }
};


OracleDB.prototype._getColumnType = function(sqlTable, column, value, oracleOptions, postponedBooleanColumns, postponedNullColumns) {
	  var self = this;
	  
	  var type = undefined;
	  
	  if(value === null) {
		  type = "varchar2(1)";
		  postponedNullColumns.push(column);
	  } else if(typeof value === 'string') {
		  var len = Buffer.byteLength(value, 'utf8');
		  if(len <= 0) len = 1;
		  type = "varchar2("+len+")";
	  } else if(typeof value === 'number') {
		  var ns = '' + value;
		  var index = ns.indexOf(".");
		  if(index >= 0) {
			  // contains "."
			  type = "number("+(ns.length-1)+", "+(ns.length - index - 1)+")";					  
		  } else {
			  type = "number("+ns.length+")";					  
		  }
	  } else if (typeof value === 'boolean') {
		  if(typeof oracleOptions.booleanTrueValue === 'number'
			  && typeof oracleOptions.booleanFalseValue === 'number') {
				  type = "number";
				  if(0 <= oracleOptions.booleanTrueValue && oracleOptions.booleanTrueValue < 10 &&
						  0 <= oracleOptions.booleanFalseValue && oracleOptions.booleanFalseValue < 10 ) {
					  type = "number(1)";
				  }
			  } else if(typeof oracleOptions.booleanTrueValue === 'string'
				  && typeof oracleOptions.booleanFalseValue === 'string') {
					  var maxLen = oracleOptions.booleanTrueValue.length;
					 
					  if(maxLen < oracleOptions.booleanFalseValue.length) {
						  maxLen = oracleOptions.booleanFalseValue.length;
					  }
				  type = "varchar2("+maxLen+")"; // "true" or "false"
			  } else {
				  console.log("oracleOptions", oracleOptions);
				  throw new Error("Invalid parameters booleanTrueValue or booleanFalseValue");
			  }
		  postponedBooleanColumns.push(column);
	  } else if(value instanceof Date) {
		  type = "date";
	  } else if(value instanceof Array) {
	  } else if(value !== null && typeof value === 'object') {
	  }
	  
	  if(type) {
		  if(value === null) {
			  type = type + " null";
		  } else {
			  // Check if there are any records in the table
			  var sql = "select "+OracleDB.q("_id")+" from "+OracleDB.q(sqlTable)+" where rownum = 1";
			  
			  var result = self.executeCommand(sql, [], oracleOptions);

			  if(result.records.length === 0) {
				  // No rows, turn the column not null
				  type = type + " not null";
			  }
			  
		  }
	  }
	  return type;
};

OracleDB.prototype._ensureColumnsPostProcess = function(sqlTable, oracleOptions, refreshCols, postponedBooleanColumns, postponedNullColumns) {
	  var self = this;

	  if(refreshCols) {
		  self._refreshTable(sqlTable, oracleOptions);
		  refreshCols = false;
	  }

	  var table = self._tables[sqlTable];		  
	  
	  for(var i = 0; i < postponedBooleanColumns.length; i++) {
		  var column = postponedBooleanColumns[i];
		  
		  var columnDesc = table.columns[column];

		  var sql = "alter table "+OracleDB.q(sqlTable)+" add constraint "+ OracleDB.q(sqlTable + "_BOOL_CHK" + columnDesc.columnId) + " CHECK ("+
		  OracleDB.q(columnDesc.columnName)+" IN (NULL, '"+oracleOptions.booleanTrueValue+"', '"+oracleOptions.booleanFalseValue+"')) ENABLE";

		  var result = self.executeCommand(sql, [], oracleOptions);				  

		  refreshCols = true;
	  }

	  for(var i = 0; i < postponedNullColumns.length; i++) {
		  var column = postponedNullColumns[i];
		  
		  var columnDesc = table.columns[column];
		  var sql = "alter table "+OracleDB.q(sqlTable)+" add constraint "+ OracleDB.q(sqlTable + "_NULL_CHK" + columnDesc.columnId) + " CHECK ("+
		  OracleDB.q(columnDesc.columnName)+" IS NULL) ENABLE";

		  var result = self.executeCommand(sql, [], oracleOptions);
		  
		  refreshCols = true;
	  }

	  if(refreshCols) {
		  self._refreshTable(sqlTable, oracleOptions);
	  }
};

OracleDB.prototype._ensureSelectableColumns = function(sqlTable, fields, oracleOptions) {
	  var self = this;
	  var table = self._tables[sqlTable];

	  var postponedBooleanColumns = [];
	  var postponedNullColumns = [];
	  var refreshCols = false;
	  
	  for(var column in fields) {
		  var value = fields[column];

		  if(value || value === null) {
			  column = OracleDB._columnNameM2O(column);
			  
			  var columnDesc = table.columns[column]; 
			  
			  if(!columnDesc) {
				  var type = "varchar2(1) null";
				  
				  var sql = "alter table "+OracleDB.q(sqlTable)+" add ("+OracleDB.q(column)+" "+type+")";
				  var result = self.executeCommand(sql, [], oracleOptions);
				  
				  postponedNullColumns.push(column);
				  refreshCols = true;
			  }
		  }
	  }
	  
	  self._ensureColumnsPostProcess(sqlTable, oracleOptions, refreshCols, postponedBooleanColumns, postponedNullColumns);	  
};

OracleDB.prototype._ensureColumns = function(sqlTable, doc, oracleOptions, parentSqlTable, doXCheck) {
	  var self = this;
	  var table = self._tables[sqlTable];
	  if(!table) {
		  self._ensureTable(sqlTable, oracleOptions, parentSqlTable);
		  table = self._tables[sqlTable];
		  
		  if(!table) {
			  throw new Error("Failed to create a new table");
		  }
	  }
	  
	  var postponedBooleanColumns = [];
	  var postponedNullColumns = [];
	  var refreshCols = false;
	  
	  for(var column in doc) {
		  var value = doc[column];

		  var columnDesc = table.columns[column]; 
		  if(!columnDesc) {
			  var type = self._getColumnType(sqlTable, column, value, oracleOptions, postponedBooleanColumns, postponedNullColumns);
			  
			  if(type) {
				  var sql = "alter table "+OracleDB.q(sqlTable)+" add ("+OracleDB.q(column)+" "+type+")";
				  var result = self.executeCommand(sql, [], oracleOptions);
				  refreshCols = true;
			  }
		  } else {
			  if(value !== null && (value instanceof Date || !(value instanceof Array) && typeof value !== 'object')) {
				  if(columnDesc.isNull) {
					  // Drop the null constraint
					  var sql = "alter table "+OracleDB.q(sqlTable)+" drop constraint "+ OracleDB.q(sqlTable + "_NULL_CHK" + columnDesc.columnId);

					  var result = self.executeCommand(sql, [], oracleOptions);

					  refreshCols = true;

					  // Check if there are any records in the table
					  sql = "select "+OracleDB.q("_id")+" from "+OracleDB.q(sqlTable)+" where rownum = 1";
						  
					  result = self.executeCommand(sql, [], oracleOptions);

					  if(result.records.length === 0) {
						 // No rows, turn the column not null
						 sql = "alter table "+OracleDB.q(sqlTable)+" modify ("+OracleDB.q(column)+" not null)";
							  
						 result = self.executeCommand(sql, [], oracleOptions);						  
					  }
				  }			  
			  }
			  
			  if(value === null) {
				  if(columnDesc.nullable === 'N') {
					  // Allow NULLs
					  var sql = "alter table "+OracleDB.q(sqlTable)+" modify ("+OracleDB.q(column)+" null)";

					  var result = self.executeCommand(sql, [], oracleOptions);

					  refreshCols = true;
				  }
			  } else if(typeof value === 'string') {
				  if(columnDesc.dataType === "VARCHAR2" && !columnDesc.isBoolean) {
					  var len = Buffer.byteLength(value, 'utf8');
					  if(len <= 0) len = 1;
					  
					  if(columnDesc.dataLength < len) {
						  var sql = "alter table "+OracleDB.q(sqlTable)+" modify ("+OracleDB.q(column)+" varchar2("+len+"))";

						  var result = self.executeCommand(sql, [], oracleOptions);

						  refreshCols = true;
					  }
				  }
			  } else if(typeof value === 'number') {
				  var ns = '' + value;

				  var index = ns.indexOf(".");
				  var precision;
				  var scale;
				  if(index >= 0) {
					  // contains "."
					  precision = (ns.length-1);
					  scale = (ns.length - index - 1);					  
				  } else {
					  precision = ns.length;
					  scale = 0;					  
				  }
				  
				  if(!columnDesc.isBoolean)
				  if(columnDesc.dataType === "VARCHAR2") {
					  var part1 = (precision - scale);
					  var part2 = scale;
					  var dbPart1 = columnDesc.dataLength;
					  var dbPart2 = 0;

					  var newPrecision = part1 >= dbPart1 ? part1 : dbPart1;
					  var newScale = part2 >= dbPart2 ? part2 : dbPart2;
					  newPrecision += newScale;

					  // Always alter table
					  var sql = "alter table "+OracleDB.q(sqlTable)+" modify ("+OracleDB.q(column)+" number("+newPrecision+", "+newScale+"))";

					  var result = self.executeCommand(sql, [], oracleOptions);

					  refreshCols = true;
				  } else if(columnDesc.dataType === "NUMBER") {
					  var part1 = (precision - scale);
					  var part2 = scale;
					  var dbPart1 = (columnDesc.dataPrecision - columnDesc.dataScale);
					  var dbPart2 = columnDesc.dataScale;

					  var newPrecision = part1 >= dbPart1 ? part1 : dbPart1;
					  var newScale = part2 >= dbPart2 ? part2 : dbPart2;
					  newPrecision += newScale;

					  if(newPrecision > columnDesc.dataPrecision || newScale > columnDesc.dataScale) {
						  var sql = "alter table "+OracleDB.q(sqlTable)+" modify ("+OracleDB.q(column)+" number("+newPrecision+", "+newScale+"))";

						  var result = self.executeCommand(sql, [], oracleOptions);

						  refreshCols = true;
					  }
				  }
			  } else if (typeof value === 'boolean') {
				  if(columnDesc.isNull) {
					  var type = undefined;
					  
					  if(typeof oracleOptions.booleanTrueValue === 'number'
						  && typeof oracleOptions.booleanFalseValue === 'number') {
						  type = "number";
						  if(0 <= oracleOptions.booleanTrueValue && oracleOptions.booleanTrueValue < 10 &&
									  0 <= oracleOptions.booleanFalseValue && oracleOptions.booleanFalseValue < 10) {
								  if(columnDesc.dataType !== "NUMBER") {
									  type = "number(1)";
								  }
						  }
					  } else if(typeof oracleOptions.booleanTrueValue === 'string'
							  && typeof oracleOptions.booleanFalseValue === 'string') {
								  var maxLen = oracleOptions.booleanTrueValue.length;
								 
								  if(maxLen < oracleOptions.booleanFalseValue.length) {
									  maxLen = oracleOptions.booleanFalseValue.length;
								  }
								  if(columnDesc.dataType !== "VARCHAR2" || columnDesc.dataLength < maxLen) {
									  type = "varchar2("+maxLen+")"; // "true" or "false"
								  }
					  } else {
							  throw new Error("Invalid parameters booleanTrueValue or booleanFalseValue", oracleOptions);
					  }
						  
				  	  if(type) {
				  		  var sql = "alter table "+OracleDB.q(sqlTable)+" modify ("+OracleDB.q(column)+" "+type+")";

				  		  var result = self.executeCommand(sql, [], oracleOptions);
				  	  }

				  	  postponedBooleanColumns.push(column);
				  }
			  } else if(value instanceof Date) {
				  if(columnDesc.isNull) {
					  var type = "date";
					  
			  		  var sql = "alter table "+OracleDB.q(sqlTable)+" modify ("+OracleDB.q(column)+" "+type+")";

			  		  var result = self.executeCommand(sql, [], oracleOptions);					  
				  }
			  } else if(value instanceof Array) {
				  continue;
			  } else if(value != null && typeof value === 'object') {
				  continue;				  
			  }
		  }
	  }
	  
	  // Crosscheck is any columns are missing in the document
	  if(doXCheck)
	  for(var i = 0; i < table.colRecords.length; i++) {
		  var colRec = table.colRecords[i];
		  
		  if(colRec.columnName === "_id" || colRec.columnName === "_indexNo") {
			  continue;
		  }

		  var value = doc[colRec.meteorName];

		  if(value === undefined || (value instanceof Array) || (value != null && typeof value === 'object')) {
			  // missing column ... allow nulls
			  if(colRec.nullable === 'N') {
				  // Allow NULLs
				  var sql = "alter table "+OracleDB.q(sqlTable)+" modify ("+OracleDB.q(colRec.columnName)+" null)";

				  var result = self.executeCommand(sql, [], oracleOptions);

				  refreshCols = true;				  
			  }
		  }
	  }
	  
	  self._ensureColumnsPostProcess(sqlTable, oracleOptions, refreshCols, postponedBooleanColumns, postponedNullColumns);	  
};

OracleDB.prototype.collection = function(name, oracleOptions, callback) {
	  var self = this;
	  if(typeof oracleOptions == 'function') callback = oracleOptions, oracleOptions = undefined;
	  oracleOptions = oracleOptions || Oracle.getDefaultOracleOptions();

	  try {
	      var collection = new OracleCollection(this, name, oracleOptions);
	      
	      if(collection.oracleOptions.sqlTable) {
	    	  self._ensureTable(collection.oracleOptions.sqlTable, collection.oracleOptions);
	      }
	      
	      if(callback) callback(null, collection);
	      return collection;
	  } catch(err) {
	      if(callback) return callback(err);
	      throw err;
	  }
};
