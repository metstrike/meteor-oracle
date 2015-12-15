// options.connection, if given, is a LivedataClient or LivedataServer
// XXX presently there is no way to destroy/clean up a Collection

/**
 * @summary Namespace for OracleDB-related items
 * @namespace
 */
Oracle = {};

Oracle.Collection = function (name, options, oracleOptions) {
	options = options || {};

	if (!options._driver) {
		  if (Meteor.isServer) {
		      options._driver = OracleInternals.defaultRemoteCollectionDriver();
		  }
	}

	Mongo.Collection.call(this, name, options);	

	  if (Meteor.isServer) {
		  this._collection.oracleOptions = oracleOptions;
	  }
};

//extend from parent class prototype
Oracle.Collection.prototype = Object.create(Mongo.Collection.prototype); // keeps the proto clean
Oracle.Collection.prototype.constructor = Oracle.Collection; // repair the inherited constructor

if(Meteor.isServer) {

	//
	//Default Oracle Options
	//
	Oracle._defaultOracleOptions = null;

	Oracle.resetDefaultOracleOptions = function(oracleOptions) {
		Oracle._defaultOracleOptions = oracleOptions;
		
		// Clear some items which do not make sense
		Oracle._defaultOracleOptions.sql = null;
		Oracle._defaultOracleOptions.sqlParameters = [];
	};

	Oracle.setDefaultOracleOptions = function(oracleOptions) {
		Oracle._defaultOracleOptions = Oracle._mergeOptions(oracleOptions, Oracle._defaultOracleOptions);
	};

	Oracle.getDefaultOracleOptions = function() {
		var ret = EJSON.clone(Oracle._defaultOracleOptions);
		
		// Remove the password
		if(ret.connection) {
			delete ret.connection.password;
		}
		
		return ret;
	};

	Oracle._mergeOptions = function(oracleOptions, defaultOracleOptions) {
		var o = {};
		
		for(var a in defaultOracleOptions) {
			o[a] = defaultOracleOptions[a];
		}
		
		for(var a in oracleOptions) {
			o[a] = oracleOptions[a];
		}
		
		return o;
	};

	Oracle.resetDefaultOracleOptions({
			connection: {
				user: "meteor", 
				password: "meteor", 
				connectString: "localhost/XE"
			},
			sql: null,
			sqlParameters: [],
			sqlScn: null,
			sqlAddId: false,
			sqlDebug: false,
			sqlConvertColumnNames: true, // Not implemented yet, for future use
			booleanTrueValue: "true",
			booleanFalseValue: "false"		
	});
}

Oracle.LocalDate = function (dateStr) {
    var utcDate = new Date(dateStr);
    	
    var localDate = new Date(utcDate.getTime()+utcDate.getTimezoneOffset()*60*1000);

    return localDate;   
};
