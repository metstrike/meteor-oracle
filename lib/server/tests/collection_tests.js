Tinytest.add(
  'Oracle.Collection custom select',
  function (test) {
	  //
	  // Custom selects are not supported yet.
	  //
	  
/*
	  	var options = {};
	  	
	  	var oracleOptions = {
				sql: "select * from user_users where username = :1",
				sqlParameters: ['METEOR'],
				sqlTable: null, // null means no DML, use undefined to apply the collection name as a default
				sqlAddId: true
	  	};
    
        var coll = new Oracle.Collection("users", options, oracleOptions);

        test.isNotNull(coll);
        
        var rows = coll.find({}, {skip: 0, limit: 10, sort: {USERNAME: 1}}).fetch();
        
        test.equal(rows.length, 1);
        test.equal(rows[0].USERNAME, "METEOR");

        rows = coll.findOne({}, {skip: 0, limit: 10, sort: {USERNAME: 1}});

        test.equal(rows.USERNAME, "METEOR");
*/
  }
);

Tinytest.add(
		  'create new collection testNames',
		  function (test) {
			  	var options = {};
			  	
		        var testNames = new Oracle.Collection("testNames", options);
		        
		        test.isNotNull(testNames);
		        
		        testNames._collection.dropCollection();
		        
		        var s = '## Welcome to Telescope!\n\nIf you\'re reading this, it means you\'ve successfully got Telescope to run.\n';

		        testNames.insert({name: s});

		        testNames._collection._ensureIndex({name: 1}, {unique:true, bitmap:false});
		        
		        var rows = testNames.find({}, {fields: {name: 1, _id: 0}}).fetch();
		        
		        test.equal(rows, [{"name": s}]);
		  }
		);

Tinytest.add(
		  'create new collection test_lists',
		  function (test) {
			  	var options = {};
			  	
		        var testLists = new Oracle.Collection("testLists", options);
		        
		        test.isNotNull(testLists);

		        testLists._collection.dropCollection();
		        
		        testLists.insert({name: "Principles", incompleteCount:37, userId: "Michael", closed: true, createdAt: Oracle.LocalDate("2010-05-19T00:00:00"),
		        		tags:[{tag:"CANCELLED", owner: "John"}, {tag: "SUBMITTED", owner: "Mary"}]});
		        
		        testLists.insert({name: "Languages", incompleteCount:22, userId: "Andrea", closed: false, 
		        	tags: [{tag:"OK", owner: "Helen" /*, groups: [{name: "ADMINS"}, {name: "USERS"}]*/}, 
		        	       {tag:"APPROVED", owner: "Keith"}, 
		        	       {tag: "QA PASSED", owner: "Curtis"}]});
		        
		        testLists.insert({name: "Favorites", incompleteCount:28, userId: "Amit"});
		        
		        // Test indexes
		        testLists._collection._ensureIndex({userId: 1, name: 1}, {unique:true, bitmap:false});
		        testLists._collection._ensureIndex({userId: 1, name: -1}, {unique:true, bitmap:false});
		        testLists._collection._ensureIndex({"tags._id": 1, "tags.tag": 1}, {unique:true, bitmap:false});
		        testLists._collection._ensureIndex({"tags._id": 1, "tags.tag": -1}, {unique:true, bitmap:false});
		        
		        testLists._collection._dropIndex({userId: 1, name: -1});
		        testLists._collection._dropIndex({"tags._id": 1, "tags.tag": -1});
		        
		        // Test the find() functionality
		        var rows;
		        
		        rows = testLists.findOne({}, {skip: 0, limit: 10, fields: {_id: 0, tags: 0}, sort: {name: 1}}); 
		        test.equal(rows, {name: 'Favorites', incompleteCount: 28, userId: 'Amit'});

		        rows = testLists.findOne({'tags.0.tag': "CANCELLED"}, {skip: 0, limit: 10, fields: {_id: 0, tags: 0}, sort: {name: 1}});
		        test.equal(rows, {name: "Principles", incompleteCount:37, userId: "Michael", closed: true, createdAt: Oracle.LocalDate("2010-05-19T00:00:00")});
		        
		        rows = testLists.findOne({'tags.0.tag': "CANCELLED"}, {skip: 0, limit: 10, sort: {name: 1}});		   
		        delete rows._id;
		        test.equal(rows, {"name":"Principles","incompleteCount":37,"userId":"Michael","closed":true,"createdAt":Oracle.LocalDate("2010-05-19T00:00:00"),"tags":[{"tag":"CANCELLED","owner":"John"},{"tag":"SUBMITTED","owner":"Mary"}]});
		        
		        rows = testLists.findOne({incompleteCount:22, ".tags": {tag: {$like: '%A%'}}}, {skip: 0, limit: 10, sort: {name: 1}, fields: {incompleteCount: true, userId: true, tags: true, "tags.tag": true, "tags.owner": true}});		        
		        delete rows._id;
		        test.equal(rows, {"incompleteCount":22,"userId":"Andrea","tags":[{"tag":"APPROVED","owner":"Keith"},{"tag":"QA PASSED","owner":"Curtis"}]});

		        // TODO: fix complex nested structures
		        /*
		        rows = testLists.find({"tags": {$elemMatch: {$or: [{tag: "OK", owner: "Helen"}, {tag: "CANCELLED"}]}}}, {skip: 0, limit: 10, sort: {name: 1}}).fetch();
		        for(var i = 0; i < rows.length; i++) {
		        	delete rows[i]._id;
		        }
		        
		        test.equal(rows, [{"name":"Languages","incompleteCount":22,"userId":"Andrea","closed":false,"tags":[{"tag":"OK","owner":"Helen"},{"tag":"APPROVED","owner":"Keith"},{"tag":"QA PASSED","owner":"Curtis"}]},
		                          {"name":"Principles","incompleteCount":37,"userId":"Michael","closed":true,"createdAt":Oracle.LocalDate("2010-05-19T00:00:00"),"tags":[{"tag":"CANCELLED","owner":"John"},{"tag":"SUBMITTED","owner":"Mary"}]}]);
		        */
		  }
		);

Tinytest.add(
		  'create new todo test_todos',
		  function (test) {
		        var testTodos = new Oracle.Collection("testTodos");
		        
		        test.isNotNull(testTodos);

		        testTodos._collection.dropCollection();
		        
		        testTodos.insert({name: "Get milk", priority:1, userId: "Amit"});
		        testTodos.insert({name: "Tennis match", priority:2, userId: "Amit", categories: ["Sport", "Fun"]});
		        
		        var rows;
		        
		        rows = testTodos.find({priority:1}).fetch();
		        
		        for(var i = 0; i < rows.length; i++) {
		        	delete rows[i]._id;
		        }

		        test.equal(rows, [{name: "Get milk", priority:1, userId: "Amit"}]);

		        rows = testTodos.find({priority:2}).fetch();
		        
		        for(var i = 0; i < rows.length; i++) {
		        	delete rows[i]._id;
		        }

		        test.equal(rows, [{name: "Tennis match", priority:2, userId: "Amit", categories: ["Sport", "Fun"]}]);

		        
		        // Test Update
		        testTodos.update({priority:1}, {$set: {priority: 3}});
		        testTodos.update({priority:3}, {$addToSet: {categories: {$each:["Food", "Health"]}}});
		        
		        rows = testTodos.find({priority:3}).fetch();
		        
		        for(var i = 0; i < rows.length; i++) {
		        	delete rows[i]._id;
		        }

		        test.equal(rows, [{name: "Get milk", priority:3, userId: "Amit", categories: ["Food", "Health"]}]);
		        
		        var _id = testTodos.insert({name: "Swim practice", priority:3, userId: "Josh", score: 2.2});

		        testTodos.update({_id:_id}, {$set: {score: 0.000555000666}});
		        
		        rows = testTodos.findOne({_id:_id});
		        
		        test.equal(rows, {_id: _id, name: "Swim practice", priority:3, userId: "Josh", score: 0.000555000666});
		        
		  }
		);
