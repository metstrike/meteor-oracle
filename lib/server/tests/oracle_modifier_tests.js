
Tinytest.add('test oracle modifier _compile', function (test, done) {
	
	var s;

	//
	// Tests with numbers
	//
	s = OracleModifier._compile({});
	test.isUndefined(s);
	
	s = OracleModifier._compile({$inc: {age: 1}});
	test.equal(s, "\"age\" = \"age\" + :0");
	
	s = OracleModifier._compile({$set: {age: 19}});
	test.equal(s, "\"age\" = :0");
	
	s = OracleModifier._compile({$set: {name: "Amber", age: 37}});
	test.equal(s, "\"name\" = :0, \"age\" = :1");
});


Tinytest.add('test oracle modifier _prepare', function (test, done) {
	
	var s;

	//
	// Tests with numbers
	//
	s = OracleModifier._prepare({$inc: {age: 1}});
	test.equal(s, {".": {$inc: {age: 1}}});
	
	s = OracleModifier._prepare({$set: {age: 19}});
	test.equal(s, {".": {$set: {age: 19}}});
	
	s = OracleModifier._prepare({$set: {name: "Amber", age: 37}});
	test.equal(s, {".": {$set: {name: "Amber", age: 37}}});
	
	s = OracleModifier._prepare({"tags.$set": {owner: "Amber"}});
	test.equal(s, {"tags":{".":{"$set":{"owner":"Amber"}}}});
	
	s = OracleModifier._prepare({$set: {name: "Amber", age: 37}, "tags.$set": {owner: "Amber"}});
	test.equal(s, {".": {$set: {name: "Amber", age: 37}}, "tags":{".":{"$set":{"owner":"Amber"}}}});
});

Tinytest.add('test oracle modifier process', function (test, done) {
	
	var s;

	//
	// Tests with numbers
	//
	s = OracleModifier.process({$inc: {age: 1}});
	test.equal(s, {".":"\"age\" = \"age\" + :0","*":{"age":1},"$":[1],"@":[]});
	 
	s = OracleModifier.process({$set:{age: 19}});
	test.equal(s,  {".":"\"age\" = :0","*":{"age":19},"$":[19],"@":[]});
	
	s = OracleModifier.process({$set: {name: "Amber", age: 37}});
	test.equal(s, {".":"\"name\" = :0, \"age\" = :1","*":{"name":"Amber","age":37},"$":["Amber",37],"@":[]});
});
