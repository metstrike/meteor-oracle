Tinytest.add(
  'OracleDB',
  function (test) {
	  var oracleOptions = {
			  connection: {
    		  			  user: "meteor", 
    		  			  password: "meteor", 
    		  			  connectString : "localhost/XE"
			  }
	  };

	  var db = OracleDB.getDatabase(oracleOptions);
	  
	  test.isNotNull(db);
	  
	  var result = OracleDB.executeCommand(connection, "select * from user_users", [], {});

	  test.isNotNull(result);
	  test.isNotNull(result.rows);
	  test.isNotNull(result.metaData);	  
  }
);

Tinytest.add(
 'OracleDB Error',
 function (test) {
	  var oracleOptions = {
			  connection: {
    		  			  user: "meteor", 
    		  			  password: "meteor", 
    		  			  connectString : "localhost/XE"
			  }
	  };

	  var db = OracleDB.getDatabase(oracleOptions);
	  
			  
	  test.isNotNull(db);
			  
	  test.throws(
			  function() {
				  var result = OracleDB.executeCommand(connection, "select * from missing_table", [], {});
			  }, 
	  		"ORA-00942: table or view does not exist"
	  );
  }
);


Tinytest.add(
 'OracleDBBatch',
 function (test) {
	  var oracleOptions = {
			  connection: {
    		  			  user: "meteor", 
    		  			  password: "meteor", 
    		  			  connectString : "localhost/XE"
			  }
	  };

	  var db = OracleDB.getDatabase(oracleOptions);
	  			  
	  test.isNotNull(db);
	  
	  var batch = [{sql:"select * from user_users", sqlParameters: []}, {sql:"select * from user_users", sqlParameters: []}];
	  var result = OracleDB.executeBatch(connection, batch, {});
			  
	  test.isNotNull(result);
	  test.isTrue(result instanceof Array);
	  test.equal(result.length, 2);
  }
);


Tinytest.add(
  'OracleDBBatch Error',
  function (test) {
	  var oracleOptions = {
			  connection: {
    		  			  user: "meteor", 
    		  			  password: "meteor", 
    		  			  connectString : "localhost/XE"
			  }
	  };

	  var db = OracleDB.getDatabase(oracleOptions);
	  
	  test.isNotNull(db);
			  
	  test.throws(
			  function() {
				  var batch = [{sql:"select * from missing_table", sqlParameters: []}, {sql:"select * from user_users", sqlParameters: []}];
				  var result = OracleDB.executeBatch(connection, batch, {});
			  }, 
	  		"ORA-00942: table or view does not exist"
	  );			  
  }
);
