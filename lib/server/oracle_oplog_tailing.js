var Future = Npm.require('fibers/future');

OPLOG_COLLECTION = 'oplog';

var TOO_FAR_BEHIND = process.env.METEOR_OPLOG_TOO_FAR_BEHIND || 2000;

idForOp = function (op) {
  if (op.op === 'd')
    return op.o._id;
  else if (op.op === 'i')
    return op.o._id;
  else if (op.op === 'u')
    return op.o2._id;
  else if (op.op === 'c')
    throw Error("Operator 'c' doesn't supply an object with id: " +
                EJSON.stringify(op));
  else
    throw Error("Unknown op: " + EJSON.stringify(op));
};

OplogHandle = function (oplogUrl, dbName) {
  var self = this;
  self._oplogUrl = oplogUrl;
  self._dbName = dbName;

  self._oplogConnection = null;
  self._stopped = false;
  self._tailHandle = null;
  self._readyFuture = new Future();
  self._crossbar = new DDPServer._Crossbar({
    factPackage: "mongo-livedata", factName: "oplog-watchers"
  });
  self._baseOplogSelector = {
    ns: new RegExp('^' + Meteor._escapeRegExp(self._dbName) + '\\.'),
    $or: [
      { op: {$in: ['i', 'u', 'd']} },
      // drop collection
      { op: 'c', 'o.drop': { $exists: true } },
      { op: 'c', 'o.dropDatabase': 1 },
    ]
  };

  // Data structures to support waitUntilCaughtUp(). Each oplog entry has a
  // MongoTimestamp object on it (which is not the same as a Date --- it's a
  // combination of time and an incrementing counter; see
  // http://docs.mongodb.org/manual/reference/bson-types/#timestamps).
  //
  // _catchingUpFutures is an array of {id: oplogId, future: Future}
  // objects, sorted by ascending id. _lastProcessedId is the
  // MongoTimestamp of the last oplog entry we've processed.
  //
  // Each time we call waitUntilCaughtUp, we take a peek at the final oplog
  // entry in the db.  If we've already processed it (ie, it is not greater than
  // _lastProcessedId), waitUntilCaughtUp immediately returns. Otherwise,
  // waitUntilCaughtUp makes a new Future and inserts it along with the final
  // timestamp entry that it read, into _catchingUpFutures. waitUntilCaughtUp
  // then waits on that future, which is resolved once _lastProcessedId is
  // incremented to be past its timestamp by the worker fiber.
  //
  // XXX use a priority queue or something else that's faster than an array
  self._catchingUpFutures = [];
  self._lastProcessedId = null;

  self._onSkippedEntriesHook = new Hook({
    debugPrintExceptions: "onSkippedEntries callback"
  });

  self._entryQueue = new Meteor._DoubleEndedQueue();
  self._workerActive = false;

  self._startTailing();
  self._tailingJobActive = false;
  self._tailingJobIntervalId = null;
};

OplogHandle._mergeLogs = function(log1, log2) {
	
	for(var a in log2) {
		if(log1[a] && log1[a] instanceof Object && log2[a] instanceof Object) {
			OplogHandle._mergeLogs(log1[a], log2[a]);
		} else {
			log1[a] = log2[a];
		}
	}
};

_.extend(OplogHandle.prototype, {
  stop: function () {
    var self = this;
    if (self._stopped)
      return;
    self._stopped = true;
    if (self._tailHandle)
      self._tailHandle.stop();
    // XXX should close connections too
  },
  onOplogEntry: function (trigger, callback) {
    var self = this;
    if (self._stopped)
      throw new Error("Called onOplogEntry on stopped handle!");

    // Calling onOplogEntry requires us to wait for the tailing to be ready.
    self._readyFuture.wait();

    var originalCallback = callback;
    callback = Meteor.bindEnvironment(function (notification) {
      // XXX can we avoid this clone by making oplog.js careful?
      originalCallback(EJSON.clone(notification));
    }, function (err) {
      Meteor._debug("Error in oplog callback", err.stack);
    });
    var listenHandle = self._crossbar.listen(trigger, callback);
    return {
      stop: function () {
        listenHandle.stop();
      }
    };
  },
  // Register a callback to be invoked any time we skip oplog entries (eg,
  // because we are too far behind).
  onSkippedEntries: function (callback) {
    var self = this;
    if (self._stopped)
      throw new Error("Called onSkippedEntries on stopped handle!");
    return self._onSkippedEntriesHook.register(callback);
  },
  
  _transformOplogRecord: function(row) {
	  var self = this;
	  
	  try {
		  if(row.o2) {
			  row.o2 = EJSON.parse(row.o2);
		  }		  
		  if(row.o) {
			  row.o = EJSON.parse(row.o);
			  
			  var c = row.ns.substr(self._dbName.length + 1);
			  
			  var ca = c.split("$");

			  if(ca.length > 1) {
				row.ns = self._dbName+"."+ca[0];
				
				var nestedName = "";
				for(var i = 1; i < ca.length; i++) {
					nestedName = nestedName + ca[i];
				}
				var x = {};
				x[nestedName] = row.o._value;
				
				if(row.op === "i") {
					row.op = "u";
					row.o2 = {"_id": row.o._id};
					row.o = {"$push": x};
				} else if(row.op === "u") {
					throw new Error("Nested oplog update is not supported yet");
					row.o = {"$set": x};
				} else if(row.op === "d") {
					row.op = "u";
					row.o2 = {"_id": row.o._id};
					row.o = {"$pull": x};
				}
			  }
			  
			  for(var i in row.o) {
				  var v = row.o[i];
				  
				  if(v === "") {
					  delete row.o[i];
				  }
			  }
		  }
	  } catch (e)
	  {
		  console.log("ERROR in oplog record: "+ row.id+", o="+row.o);
		  throw e;
	  }
	  
	  return row;
  },
  
  _tailingJob : function() {
	  var self = this;
	  
	  if(self._stopped && self._tailingJobIntervalId) {
		  Meteor.clearInterval(self._tailingJobIntervalId);
		  self._tailingJobIntervalId = null;
		  self._tailingJobActive = false;
	  }

	  if(self._tailingJobActive) {
		  return;
	  }
	  
	  self._tailingJobActive = true;

	  try {
	  if(self._lastProcessedId !== null) {
	  
		  // Start after the last entry that currently exists.
		  var oplogSelector = {};
	    
		  oplogSelector.id = {$gt: self._lastProcessedId};

		  var tail = self._oplogConnection.find(
		  	      OPLOG_COLLECTION, oplogSelector, {skip: 0, limit: 100, sort: {id: 1}, fields: {_id:0, id: 1, ts: 1, tr
		  	    	  :1, v:1, op:1, ns:1, o:1 , o2:1}});

		  var rows = tail.fetch();

		  var trows = [];
		  for(var i = 0; i < rows.length; i++) {
			  var row = rows[i];
			  
			  row = self._transformOplogRecord(row);
			  trows.push(row);
		  }
		  
		  
		  for(var i = 0; i < trows.length; i++) {
			  var row = trows[i];
			  
			  // Try to merge the next one
			  var cont = true;
			  while(cont && i < rows.length-1) {
				  var nrow = trows[i+1];
				  
				  if(row.op === 'u' && nrow.op === 'u' && row.tr === nrow.tr && row.ns === nrow.ns && EJSON.equals(row.o2, nrow.o2)) {
					  OplogHandle._mergeLogs(row.o, nrow.o);
					  row.id = nrow.id;
					  i++;
				  } else {
					  cont = false;
				  }
			  }
			  
		      self._entryQueue.push(row);
		      self._maybeStartWorker();  
		      self._lastProcessedId = trows[i].id;		      
		  }
		  
		  if(rows.length > 0) {
			  if(Oracle._defaultOracleOptions.sqlDebug) {
				  console.log("OPLOG: processed "+rows.length+" records, lastProcessedId: "+self._lastProcessedId);
			  }
		  }
	  }
	  } catch(e) {
	      console.log("ERROR in oplog tailing job: "+e);
	      throw e;
	  } finally {
		  self._tailingJobActive = false;
	  }
  },
  // Calls `callback` once the oplog has been processed up to a point that is
  // roughly "now": specifically, once we've processed all ops that are
  // currently visible.
  // XXX become convinced that this is actually safe even if oplogConnection
  // is some kind of pool
  waitUntilCaughtUp: function () {
    var self = this;
    if (self._stopped)
      throw new Error("Called waitUntilCaughtUp on stopped handle!");

    // Calling waitUntilCaughtUp requries us to wait for the oplog connection to
    // be ready.
    self._readyFuture.wait();

    while (!self._stopped) {
      // We need to make the selector at least as restrictive as the actual
      // tailing selector (ie, we need to specify the DB name) or else we might
      // find a id that won't show up in the actual tail stream.
      try {
        var lastEntry = self._oplogConnection.findOne(
          OPLOG_COLLECTION, {},
          {fields: {_id:0, id: 1}, sort: {id: -1}});
        break;
      } catch (e) {
        // During failover (eg) if we get an exception we should log and retry
        // instead of crashing.
        Meteor._debug("Got exception while reading last entry: " + e);
        Meteor._sleepForMs(100);
      }
    }

    if (self._stopped)
      return;

    if (!lastEntry) {
      // Really, nothing in the oplog? Well, we've processed everything.
      return;
    }

    var id = lastEntry.id;
    if (!id)
      throw Error("oplog entry without id: " + EJSON.stringify(lastEntry));

    if (self._lastProcessedId && id <= (self._lastProcessedId)) {
      // We've already caught up to here.
      return;
    }


    // Insert the future into our list. Almost always, this will be at the end,
    // but it's conceivable that if we fail over from one primary to another,
    // the oplog entries we see will go backwards.
    var insertAfter = self._catchingUpFutures.length;
    while (insertAfter - 1 > 0
           && self._catchingUpFutures[insertAfter - 1].id > (id)) {
      insertAfter--;
    }
    var f = new Future;
    self._catchingUpFutures.splice(insertAfter, 0, {id: id, future: f});
    f.wait();
  },
  
  _startTailing: function () {
    var self = this;
    
    // The oplog connection
    self._oplogConnection = new OracleConnection();

	if(self._lastProcessedId === null) {
		
		try {
	    // Find the last oplog entry.
	    var lastOplogEntry = self._oplogConnection.findOne(
	      OPLOG_COLLECTION, {}, {sort: {id: -1}, fields: {_id:0, id: 1}});

	    if (lastOplogEntry) {
	      // If there are any calls to callWhenProcessedLatest before any other
	      // oplog entries show up, allow callWhenProcessedLatest to call its
	      // callback immediately.
	      self._setLastProcessedId(lastOplogEntry.id);
	    } else {
		  self._setLastProcessedId(0);	    	
	    }
	    
		} catch(ex)
		{
			if(ex.message === "Table \"oplog\" does not exist and can't be created in strict mode") {
				console.log("WARNING: oplog tailing not started in strict mode due to missing oplog table");
				self._readyFuture.return();
				return;
			} else {
				throw ex;
			}
		}
	}
		  
    self._tailingJobIntervalId = Meteor.setInterval(function f() {self._tailingJob();}, 100);
    
    self._readyFuture.return();
  },

  _maybeStartWorker: function () {
    var self = this;
    if (self._workerActive)
      return;
    self._workerActive = true;
    Meteor.defer(function () {
      try {
        while (! self._stopped && ! self._entryQueue.isEmpty()) {
          // Are we too far behind? Just tell our observers that they need to
          // repoll, and drop our queue.
          if (self._entryQueue.length > TOO_FAR_BEHIND) {
            var lastEntry = self._entryQueue.pop();
            self._entryQueue.clear();

            self._onSkippedEntriesHook.each(function (callback) {
              callback();
              return true;
            });

            // Free any waitUntilCaughtUp() calls that were waiting for us to
            // pass something that we just skipped.
            self._setLastProcessedId(lastEntry.id);
            continue;
          }

          var doc = self._entryQueue.shift();

          if (!(doc.ns && doc.ns.length > self._dbName.length + 1 &&
                doc.ns.substr(0, self._dbName.length + 1) ===
                (self._dbName + '.'))) {
            throw new Error("Unexpected ns: "+doc.ns+"/"+self._dbName);
          }

          var trigger = {collection: doc.ns.substr(self._dbName.length + 1),
                         dropCollection: false,
                         dropDatabase: false,
                         op: doc};

          // Is it a special command and the collection name is hidden somewhere
          // in operator?
          if (trigger.collection === "$cmd") {
            if (doc.o.dropDatabase) {
              delete trigger.collection;
              trigger.dropDatabase = true;
            } else if (_.has(doc.o, 'drop')) {
              trigger.collection = doc.o.drop;
              trigger.dropCollection = true;
              trigger.id = null;
            } else {
              throw Error("Unknown command " + JSON.stringify(doc));
            }
          } else {
            // All other ops have an id.
            trigger.id = idForOp(doc);
          }

          self._crossbar.fire(trigger);

          // Now that we've processed this operation, process pending
          // sequencers.
          if (!doc.id)
            throw Error("oplog entry without id: " + EJSON.stringify(doc));
          self._setLastProcessedId(doc.id);
        }
      } finally {
        self._workerActive = false;
      }
    });
  },
  _setLastProcessedId: function (id) {
    var self = this;

    self._lastProcessedId = id;
    while (!_.isEmpty(self._catchingUpFutures)
           && self._catchingUpFutures[0].id <= (
             self._lastProcessedId)) {
      var sequencer = self._catchingUpFutures.shift();
      sequencer.future.return();
    }
  }
});


