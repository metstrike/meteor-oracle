var path = Npm.require('path');
var Fiber = Npm.require('fibers');
var Future = Npm.require(path.join('fibers', 'future'));

OracleInternals = {};
OracleTest = {};

OracleInternals.NpmModules = {
  Oracledb: {
    version: NpmModuleOracledbVersion,
    module: OracleDB
  }
};

OracleInternals.NpmModule = OracleDB;

// Inherits from MongoConnection
OracleConnection = function (options) {
  var self = this;

  options = options || {};
  
  // Clone the options
  var options2 = Oracle._mergeOptions({}, options);  

  var mongoOplogUrl = process.env.MONGO_OPLOG_URL;
  if(options2.oplogUrl) {
	  options2.oplogUrl = mongoOplogUrl;
  }
  
  var mongoUrl = process.env.MONGO_URL;  
  MongoInternals.Connection.call(this, mongoUrl, options2);
  
  // Closing the mongo connection created by parent
  self.close();
  
  self.options = options;

  self.db = OracleDB.getDatabase(Oracle._defaultOracleOptions.connection);

  if (options.oplogUrl && ! Package['disable-oplog']) {
	  self._oplogHandle = new OplogHandle(options.oplogUrl, self.db.databaseName);
  }
};

//extend from parent class prototype
OracleConnection.prototype = Object.create(MongoInternals.Connection.prototype); // keeps the proto clean
OracleConnection.prototype.constructor = OracleConnection; // repair the inherited constructor

//Returns the Mongo Collection object; may yield.
OracleConnection.prototype.rawCollection = function (collectionName) {
  var self = this;

  if (! self.db)
    throw Error("rawCollection called before Connection created?");

  var future = new Future;

  self.db.collection(collectionName, Oracle.getDefaultOracleOptions(), future.resolver());

  return future.wait();  
};
