
Tinytest.add('test oracle selector _compile', function (test, done) {
	
	var s;

	//
	// Tests internal _compile function
	//
	
	//
	// Tests with numbers
	//
	s = OracleSelector._compile({_id: 17});
	test.equal(s, "\"_id\" = 17");
	
	s = OracleSelector._compile({age: {$gt: 17}});
	test.equal(s, "\"age\" > 17");
	
	s = OracleSelector._compile({age: {$lt: 17}});
	test.equal(s, "\"age\" < 17");
	
	s = OracleSelector._compile({age: {$gte: 17}});
	test.equal(s, "\"age\" >= 17");
	
	s = OracleSelector._compile({age: {$lte: 17}});
	test.equal(s, "\"age\" <= 17");
	
	s = OracleSelector._compile({age: {$mod: [5, 3]}});
	test.equal(s, "mod(\"age\", 5) = 3");

	s = OracleSelector._compile({cnt: {$gte: 17}, age:{$mod: [5, 3]}});
	test.equal(s, "(\"cnt\" >= 17) AND (mod(\"age\", 5) = 3)");

	s = OracleSelector._compile({cnt: 2, age: {'$gte': 10, '$lt': 20}});
	test.equal(s, "(\"cnt\" = 2) AND ((\"age\" >= 10) AND (\"age\" < 20))");

	s = OracleSelector._compile({age: {$in: [17, 13, 35, 198]}});
	test.equal(s, "\"age\" IN (17, 13, 35, 198)");

	s = OracleSelector._compile({age: {$nin: [17, 13, 35, 198]}});
	test.equal(s, "\"age\" NOT IN (17, 13, 35, 198)");

	s = OracleSelector._compile({age: 17});
	test.equal(s, "\"age\" = 17");
	
	s = OracleSelector._compile({age: {$eq: 17}});
	test.equal(s, "\"age\" = 17");
	
	s = OracleSelector._compile({age: {$ne: 17}});
	test.equal(s, "(\"age\" <> 17 OR \"age\" IS NULL)");
	
	s = OracleSelector._compile({age: {$not: 17}});
	test.equal(s, "NOT(\"age\" = 17)");
	
	s = OracleSelector._compile({$and: [{age: {$gte: 17}}, {age: {$lte: 65}}]});
	test.equal(s, "(\"age\" >= 17) AND (\"age\" <= 65)");

	s = OracleSelector._compile({$or: [{age: {$gte: 17}}, {age: {$lte: 65}}]});
	test.equal(s, "(\"age\" >= 17) OR (\"age\" <= 65)");

	s = OracleSelector._compile({$nor: [{age: {$gte: 17}}, {age: {$lte: 65}}]});
	test.equal(s, "NOT((\"age\" >= 17) OR (\"age\" <= 65))");

	//
	// Tests with Strings
	//
	s = OracleSelector._compile({name: {$lte: "Bill"}});
	test.equal(s, "\"name\" <= 'Bill'");
	
	s = OracleSelector._compile({name: {$in: ["Bill", "Jane"]}});
	test.equal(s, "\"name\" IN ('Bill', 'Jane')");

	s = OracleSelector._compile({name: {$nin: ["Bill", "Jane"]}});
	test.equal(s, "\"name\" NOT IN ('Bill', 'Jane')");

	s = OracleSelector._compile({name: "Bill"});
	test.equal(s, "\"name\" = 'Bill'");

	s = OracleSelector._compile({name: {$eq: "Bill"}});
	test.equal(s, "\"name\" = 'Bill'");

	s = OracleSelector._compile({name: {$ne: "Bill"}});
	test.equal(s, "(\"name\" <> 'Bill' OR \"name\" IS NULL)");

	s = OracleSelector._compile({name: {$not: "Bill"}});
	test.equal(s, "NOT(\"name\" = 'Bill')");
	
	s = OracleSelector._compile({name: {$regex: "Bill*"}});
	test.equal(s, "REGEXP_LIKE(\"name\", 'Bill*')");

	s = OracleSelector._compile({$and: [{name: {$gte: "Bill"}}, {age: {$lte: "Jane's"}}]});
	test.equal(s, "(\"name\" >= 'Bill') AND (\"age\" <= 'Jane''s')");

	s = OracleSelector._compile({$or: [{name: {$gte: "Bill"}}, {age: {$lte: "Jane's"}}]});
	test.equal(s, "(\"name\" >= 'Bill') OR (\"age\" <= 'Jane''s')");

	s = OracleSelector._compile({$nor: [{name: {$gte: "Bill"}}, {age: {$lte: "Jane's"}}]});
	test.equal(s, "NOT((\"name\" >= 'Bill') OR (\"age\" <= 'Jane''s'))");

	s = OracleSelector._compile({name: {$lte: "Bill"}, $comment: "This is a comment"});
	test.equal(s, "\"name\" <= 'Bill'");
	
	s = OracleSelector._compile({$where: "substr(\"name\", 1, 3) = 'Bil'", $comment: "This is a comment"});
	test.equal(s, "substr(\"name\", 1, 3) = 'Bil'");
	
	//
	// Tests with Boolean
	//
	
	s = OracleSelector._compile({name: {$exists: true}});
	test.equal(s, "\"name\" IS NOT NULL");

	s = OracleSelector._compile({name: {$exists: false}});
	test.equal(s, "\"name\" IS NULL");

	//
	// Test with empty
	//
	s = OracleSelector._compile({});
	test.equal(s, "");
	
	s = OracleSelector._compile({"tags.0.tag": {$eq: "OK"}}, "lists");
	test.equal(s, "\"_id\" IN (SELECT DISTINCT \"_id\" FROM \"lists$tags\" WHERE \"_indexNo\" = 0 AND \"tag\" = 'OK')");
	
	s = OracleSelector._compile({"tags._value": {$ne: "OK"}}, "lists");
	test.equal(s, "\"_id\" NOT IN (SELECT DISTINCT \"_id\" FROM \"lists$tags\" WHERE \"_value\" = 'OK')");
	
	s = OracleSelector._compile({"tags": {$elemMatch: {tag: "OK", owner: "Helen"}}}, "lists");
	test.equal(s, "\"_id\" IN (SELECT DISTINCT \"_id\" FROM \"lists$tags\" WHERE (\"tag\" = 'OK') AND (\"owner\" = 'Helen'))");
	
	//
	// Custom extensions tests
	//
	s = OracleSelector._compile({name: {$like: "Bill%"}});
	test.equal(s, "\"name\" LIKE 'Bill%'");

});

Tinytest.add('test oracle selector _prepare', function (test, done) {
		
	var s;

	//
	// Tests internal _prepare function
	//
	
	s = OracleSelector._prepare({name: "Bill", ".tags": {owner: "Helen"}});
	test.equal(s, {".":{"name":"Bill"},"tags":{".":{"owner":"Helen"}}});

	s = OracleSelector._prepare({name: "Bill", "tags.0.tag": {$eq: "OK"}, ".tags": {owner: "Helen"}});
	test.equal(s, {".":{"name": "Bill", "tags.0.tag":{$eq: "OK"}},"tags":{".":{"owner":"Helen"}}});
	
});


Tinytest.add('test oracle selector process', function (test, done) {
		
	var s;

	//
	// Tests the process function
	//
	
	s = OracleSelector.process({name: "Bill"});
	test.equal(s,  {".":"\"name\" = 'Bill'","*":{"name":null}});

	s = OracleSelector.process({name: "Bill", ".tags": {owner: "Helen"}});
	test.equal(s,  {".":"\"name\" = 'Bill'","*":{"name":null},"tags":{".":"\"owner\" = 'Helen'","*":{"owner":null}}});

	s = OracleSelector.process({name: "Bill", "tags.0.tag": {$eq: "OK"}, ".tags": {owner: "Helen"}});
	test.equal(s, {".":"(\"name\" = 'Bill') AND (\"_id\" IN (SELECT DISTINCT \"_id\" FROM \"undefined$tags\" WHERE \"_indexNo\" = 0 AND \"tag\" = 'OK'))","*":{"name":null},"tags":{".":"\"owner\" = 'Helen'","*":{"owner":null}}});
	
});

