
OracleFields = {};

OracleFields._prepare = function(fields) {
	var cls = {};
	
	if(!fields) {
		return cls;
	}
	
	for(var fn in fields) {
		var fa = fn.split(".");
		
		var cl = cls;
		
		for(var i = 0; i < fa.length-1; i++) {
			var fi = fa[i];
			if(cl[fi] === undefined) {
				var n = {};
				cl[fi] = n;
				cl = n;
			} else {
				cl = cl[fi];
			}
		}
		
		if(cl["."] === undefined) {
			var n = {};
			cl["."] = n;
			cl = n;
		} else {
			cl = cl["."];			
		}
		
		// last field name
		var lfn = fa[fa.length-1];
		
		cl[lfn] = fields[fn];
	}

	return cls;
};

OracleFields.getColumnList = function(tableDesc, fields, isDetailTable) {
	var cl = "";
	var excludeId = false;
	
	if(tableDesc) {
		var incl = undefined;
		
		for(var fn in fields) {
			var value = fields[fn];
			
			if(fn === "_id") {
				if(value) {
					// ok, include _id, fall through
				} else {
					// Exclude ID, continue to next cycle
					excludeId = true;
					continue;
				}		
			}
			
			if(incl === undefined) {
				incl = value;
			}
			
			if(incl) {
				if(!value) {
					throw new Error("Inconsistent fields parameter (mixing includes and excludes)");
				}

				// Formatted field name
				var ffn = OracleDB._columnNameM2O(fn);
				
				if(tableDesc.columns[ffn]) {
					if(cl.length > 0) {
						cl = cl + ", ";
					}
					
					ffn = OracleDB.q(ffn);
					
					cl = cl + ffn;
				}
			} else {
				if(value) {
					throw new Error("Inconsistent fields parameter (mixing includes and excludes)");
				}
			}
		}
		
		if(incl) {
			// Add ID field if it wasn't included explicitly
			if(!excludeId && !fields["_id"]) {
				var s = OracleDB.q("_id");
				
				if(isDetailTable) {
					s = OracleDB.q("_id")+", "+OracleDB.q("_indexNo");
				}
				
				if(cl.length > 0) {
					s = s + ", ";
				}
				
				cl = s + cl;
			}
		} else {
			for(var c in tableDesc.columns) {
				
				if(fields[c] === undefined) {
					if(cl.length > 0) {
						cl = cl + ", ";
					}
					
					c = OracleDB.q(c);
					
					cl = cl + c;					
				}
			}
		}
	} else {
		for(var fn in fields) {
			if(fields[fn]) {

				// Formatted field name
				var ffn = OracleDB._columnNameM2O(fn);
				
				ffn = OracleDB.q(ffn);
								
				if(cl.length > 0) {
					cl = cl + ", ";
				}
				
				cl = cl + ffn;
				
			} else {
				throw new Error("OracleFields.getColumnList when collection is query based then fields parameter can't be exclusions");
			}
		}
	}
	
	return cl;
};

OracleFields.getIndexColumnList = function(tableDesc, fields) {
	var cl = "";
	
	for(var fn in fields) {
		if(tableDesc.columns[fn]) {
			if(cl.length > 0) {
				cl = cl + ", ";
			}

			// Formatted field name
			var ffn = OracleDB._columnNameM2O(fn);
			
			ffn = OracleDB.q(ffn);

			
			cl = cl + ffn;
			
			var value = fields[fn];
			
			if(typeof value === 'number' && value < 0) {
				cl = cl + " desc";
			}
		} else {
			throw new Error("OracleFields.getColumnIdList missing column in table description: "+fn);
		}
	}
	
	return cl;
}

OracleFields.getColumnIdList = function(tableDesc, fields) {
	var cl = "";
	
	for(var fn in fields) {
		if(tableDesc.columns[fn]) {
			if(cl.length > 0) {
				cl = cl + "_";
			}
			
			cl = cl + tableDesc.columns[fn].columnId;
			
			var value = fields[fn];
			
			if(typeof value === 'number' && value < 0) {
				cl = cl + "D";
			}
		} else {
			throw new Error("OracleFields.getIndexColumnList missing column in table description: "+fn);
		}
	}
	
	return cl;
}