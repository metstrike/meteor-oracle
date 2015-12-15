
Tinytest.add('test oracle sorter _compile', function (test, done) {
	
	var s;

	//
	// Tests with numbers
	//
	s = OracleSorter._compile({}, {});
	test.equal(s, "");
	
	s = OracleSorter._compile({name: 1}, {});
	test.equal(s, "\"name\"");
	
	s = OracleSorter._compile({name: 1, age: -1}, {});
	test.equal(s, "\"name\", \"age\" DESC");
	
	s = OracleSorter._compile({owner: 1, tag: 1}, {});
	test.equal(s, "\"owner\", \"tag\"");
});


Tinytest.add('test oracle sorter _prepare', function (test, done) {
	
	var s;

	//
	// Tests with numbers
	//
	s = OracleSorter._prepare({name: 1, age: 1});
	test.equal(s, {".":{"name":1, "age": 1}});

	s = OracleSorter._prepare({name: 1, "tags.0.tag": 1});
	test.equal(s, {".":{"name":1,"tags.0.tag":1}});
	
	s = OracleSorter._prepare({name: 1, ".tags": {owner: 1}});
	test.equal(s, {".":{"name":1},"tags":{".":{"owner":1}}});

	s = OracleSorter._prepare({name: 1, "tags.0.tag": 1, ".tags": {owner: 1}});
	test.equal(s, {".":{"name":1,"tags.0.tag":1},"tags":{".":{"owner":1}}});
});

Tinytest.add('test oracle sorter process', function (test, done) {
	
	var s;

	//
	// Tests with numbers
	//
	s = OracleSorter.process({name: 1, age: 1}, {});
	test.equal(s, {".":"\"name\", \"age\""});

	// TODO: fix this case
	s = OracleSorter.process({name: 1, "tags.0.tag": 1}, {});
	test.equal(s, {".":"\"name\", \"tags.0.tag\""});
	
	s = OracleSorter.process({name: 1, ".tags": {owner: 1}}, {});
	test.equal(s, {".":"\"name\"","tags":{".":"\"owner\""}});

	s = OracleSorter.process({name: 1, "tags.0.tag": 1, ".tags": {owner: 1}}, {});
	test.equal(s, {".":"\"name\", \"tags.0.tag\"","tags":{".":"\"owner\""}});
});
