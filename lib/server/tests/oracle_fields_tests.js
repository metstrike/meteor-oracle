Tinytest.add('test oracle fields _prepare', function (test, done) {
	
	var cl;

	//
	// Tests with numbers
	//
	cl = OracleFields._prepare({name: true, age: true});
	test.equal(cl, {".":{"name":true,"age":true}});
	
	cl = OracleFields._prepare({name: false, age:false});
	test.equal(cl, {".":{"name":false,"age":false}});
	
	cl = OracleFields._prepare({name: false, age:false, "tags.name": true, "tags.owner": true});
	test.equal(cl, {".":{"name":false,"age":false},"tags":{".":{"name":true, "owner": true}}});
	
	cl = OracleFields._prepare({"tags._id": 1, "tags.tag": 1});
	test.equal(cl, {"tags":{".":{"_id":1, "tag":1}}});
});

Tinytest.add('test oracle fields getColumnList', function (test, done) {
	
	var cl;
	var s;

	var tableDesc = {columns: {name: {columnId: 1}, age: {columnId: 2}, birthDate: {columnId: 3}, sex: {columnId: 4}}};
	
	cl = OracleFields._prepare({name: true, age: true});
	s = OracleFields.getColumnList(tableDesc, cl["."])
	test.equal(s, '"_id", "name", "age"');
	
	cl = OracleFields._prepare({_id:false, name: true, age: true});
	s = OracleFields.getColumnList(tableDesc, cl["."])
	test.equal(s, '"name", "age"');
	
	cl = OracleFields._prepare({name: true, age: true, _id: false});
	s = OracleFields.getColumnList(tableDesc, cl["."])
	test.equal(s, '"name", "age"');
	
	cl = OracleFields._prepare({name: false, age: false, _id: false});
	s = OracleFields.getColumnList(tableDesc, cl["."])
	test.equal(s, '"birthDate", "sex"');	
	
	cl = OracleFields._prepare({_id: false, name: false, age: false});
	s = OracleFields.getColumnList(tableDesc, cl["."])
	test.equal(s, '"birthDate", "sex"');	
	
	cl = OracleFields._prepare({name: false, age: false});
	s = OracleFields.getColumnIdList(tableDesc, cl["."])
	test.equal(s, "1_2");	
	
	cl = OracleFields._prepare({name: true, age: true});
	s = OracleFields.getColumnIdList(tableDesc, cl["."])
	test.equal(s, "1_2");	
});