OracleInternals.RemoteCollectionDriver = function (connectionOptions) {
  var self = this;
  self.oracleConnection = new OracleConnection(connectionOptions);
};

_.extend(OracleInternals.RemoteCollectionDriver.prototype, {
  open: function (name) {
    var self = this;
    var ret = {};
    
    _.each(
      ['find', 'findOne', 'insert', 'update', 'upsert',
       'remove', '_ensureIndex', '_dropIndex', '_createCappedCollection',
       'dropCollection', 'rawCollection'],
      function (m) {
        ret[m] = _.bind(self.oracleConnection[m], self.oracleConnection, name);
      });
    
    return ret;
  }
});

// Singleton collection driver with oplog tailing feature on 
OracleInternals.defaultRemoteCollectionDriver = _.once(function () {
	  var connectionOptions = {};

	  if (process.env.ORACLE_OPLOG_URL) {
	    connectionOptions.oplogUrl = process.env.ORACLE_OPLOG_URL;
	  } else {
		connectionOptions.oplogUrl = "localhost/XE";		  
	  }

	  return new OracleInternals.RemoteCollectionDriver(connectionOptions);
	});

