
OracleSorter = {};


OracleSorter._compile = function(sort, options) {
	var sorter = new Minimongo.Sorter(sort, options);
	var orderBy = "";
	
	var i = 0;

	for(key in sorter._sortSpecParts) {
		var part = sorter._sortSpecParts[key];
		
		if(i > 0) {
			orderBy = orderBy + ", ";
		}
		var column = OracleDB._columnNameM2O(part.path);
		
		column = OracleDB.q(column);
		
		orderBy = orderBy + column;
		if(part.ascending === false) {
			orderBy = orderBy + " DESC";
		} 
		i++;
	}
	
	return orderBy;
};

OracleSorter._prepare = function(sort) {
	var sls = {};
	
	if(!sort) {
		return sls;
	}
	
	for(var fn in sort) {
		if(typeof fn === 'string' && fn[0] === '.') {
			var fa = fn.slice(1).split(".");

			var sl = sls;
			
			for(var i = 0; i < fa.length; i++) {
				var fi = fa[i];
				
				if(sl[fi] === undefined) {
					var n = {};
					sl[fi] = n;
					sl = n;
				}
			}
			
			if(sl["."] === undefined) {
				sl["."] = sort[fn];
			} else {
				throw new Error("Duplicate embedded sort "+fn);
			}
		} else {
			// Add field to sls["."]
			var sl = sls["."];
			
			if(sl === undefined) {
				sl = {};
				sls["."] = sl;
			}
			
			sl[fn] = sort[fn];
		}		
	}

	return sls;
};

OracleSorter._compilePrepared = function(sort, options) {
	var rs = {};
	for(fn in sort) {
		var value = sort[fn];
		
		rs[fn] = fn === "." ? OracleSorter._compile(value, options) : OracleSorter._compilePrepared(value, options);
	}
	
	return rs;
};

OracleSorter.process = function(sort, options) {
	var s = OracleSorter._prepare(sort);

	s = OracleSorter._compilePrepared(s, options);
	
	return s;
};
