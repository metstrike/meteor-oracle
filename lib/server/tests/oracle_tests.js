
Tinytest.addAsync('oracle connection', function (test, done) {	
	var oracledb = NpmModuleOracledb;
	
	oracledb.getConnection(
			  {
			    user          : "meteor",
			    password      : "meteor",
			    connectString : "localhost/XE"
			  },
			  Meteor.bindEnvironment(function(err, connection)
			  {
			    if (err) {
			      test.fail(err.message, "Connected");
		    	  done();
			      return;
			    }

			    connection.execute(
			      "SELECT user from dual",
			      [],
			      Meteor.bindEnvironment(function(err, result)
			      {
			    	  test.isNotNull(result);
			    	  test.isUndefined(err);
			    	  var rows = result.rows;
			    	  var row = rows[0];
			    	  var user = row[0];
			    	  test.equal(user, "METEOR", "Logged in as user METEOR");
			    	  done();
			      }));
			  }));
	
});
