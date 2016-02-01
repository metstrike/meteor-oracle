# meteor-oracle 0.2.0
This package allows thousands of enterprises to build and deploy **Meteor** applications that access their data stored in **Oracle** databases.

### Examples
**Example 1:** Create Oracle.Collection and use it the same way as Mongo.Collection
```javascript
var coll = new Oracle.Collection("todos");

coll.insert({name: "Get milk", priority:1, userId: "Jane"});

var rows = coll.find({priority:1}).fetch();

console.log(rows);
```
The example above executes the following SQL commands in Oracle database:
```
INSERT INTO "todos" ("name", "priority", "userId", "_id") VALUES (:0, :1, :2, :3) 
Parameters: [ 'Get milk', 1, 'Jane', '46662dSw2KkzpNXqo' ]

SELECT * FROM (SELECT * FROM "todos") WHERE "priority" = 1
```
And will print the following rows result:
```js
[ { _id: '46662dSw2KkzpNXqo', name: 'Get milk', priority: 1, userId: 'Jane' } ]
```
**Example 2:** Connect to a different Oracle account
```javascript
Oracle.setDefaultOracleOptions(
    {connection:
    	{user: "scott", 
    	password: "tiger", 
    	connectString : "host:1521/sid"
    	}
    });
```
**Example 3:** Turn on debug mode which prints all the executed SQL statements
```js
Oracle.setDefaultOracleOptions({sqlDebug: true});
```
**Example 4:** Prevent automatic changes in db schema (turn off elastic data model, turn on strict mode)
```js
Oracle.setDefaultOracleOptions({strict: true});
```
Prevents adding or changing any table or trigger.

**Example 5:** Prevent adding or changing any DB object, except oplog table and oplog triggers
```js
Oracle.setDefaultOracleOptions({strictAllowOplogAndTriggers: true});
```

### Installation
See **Detailed Installation Instructions** below for more information.

**Step 1:** Install or get access to **Oracle Database**

**Step 2:** Install **Oracle Instant Client**

**Step 3:** Create a meteor account in your oracle database.
```bash
$ sqlplus sys as sysdba
create user meteor identified by meteor;
grant connect, resource to meteor;
```
**Step 4:** Add **meteor-oracle** package to your meteor project
```bash
$ cd <PATH-TO-YOUR-METEOR-PROJECT>
$ export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:<PATH-TO-YOUR-ORACLE-INSTANT-CLIENT>/instantclient_11_2/
$ meteor add metstrike:meteor-oracle
$ meteor
```

### Run TODOS Example Application with Oracle
It was very easy to convert the TODO example application. The modified version can be found here: [https://github.com/metstrike/todos-oracle](https://github.com/metstrike/todos-oracle).

---
### Approach
There are several other projects trying to integrate Meteor with SQL database and this is just another attempt to fit the concept of relational database into the architecture of Meteor. The current approach allows developers to write Meteor applications the same way as if they were writing them for MongoDB. The only difference is that instead of **Mongo.Collection** they need to use **Oracle.Collection**. All the remaining code stays the same and the application should work. No database tables or indexes have to be created by developer, the driver will create and maintain them all automatically.Similarly no database triggers to populate the oplog table have to be created manually, the driver will generate them automatically whenever a new collecton is created and it will regenerate them whenever a new column is added to the collection.

The simlicity and benefits of this approach can be demonstrated on existing sample Meteor applications like [TODOS](https://github.com/metstrike/todos-oracle) which can be very easily converted to work with Oracle. There is a caveat though, the developers need to be aware of current feature restrictions (and extensions) of this package. Not all features (e.g. the nested data structures) are currently supported and in the future some innovative features (e.g. the reactive $join operator) may be available in Oracle collections, while still not available in Mongo.

Oracle database provides a lot of rich and robust features, that are used by thousands of enterprises accros the world. A few examples in no particular order are: inner and outer joins (duh), views, bitmap indexes, library of packages, analytical and window queries, full text indexing, high availability, partitioning, materialized views, CLOBs/BLOBs, etc. The most useful features might be gradually exposed in this package allowing developers to incorporate them into their enterprise applications.

The current implementation is trying to reuse as much of existing Meteor code as possible so that it could be easily maintained in the future. The core objects (Oracle.Collection, OracleConnection) are inheriting most of the functionality from their mongo counterparts (Mongo.Collection, MongoConnection). In fact, the **Oracle.Collection** on the client side behaves 100% the same as Mongo.Collection. All the modifications are implemented on the server side only. 

This package is dependent on [node-oracledb](https://github.com/oracle/node-oracledb), the Oracle Database driver for Node.js maintained by Oracle Corp. All the SQL queries and commands are being sent to this module, which handles all the communication with the Oracle database.

---
### Releases
### 0.2.0 (2/1/2015)

* Connectivity to external Oracle databases
* Strict mode that prevents automatic changes in db schema (turns off elastic data model)
* Automatic creation of OPLOG table and METEOR_PKG package
* Removed dependency on DBMS_FLASHBACK

### 0.1.0 (12/15/2015)
__Features:__

* **Oracle.Collection** class which behaves the same as **Mongo.Collection**
* **SQL Generator** translating mongo style operations into SQL language
    * implemented in **OracleCollection** class
    * find(), findOne() operations are translated into **SELECT ... FROM ...**
        * most of the selector operators are supported
            * value operators: **$not, $eq, $ne, $exists**
            * element operators: **$lt, $gt, $lte, $gte, $like, $mod, $in, $nin, $regex**
            * logical operators: **$and, $or, $nor**
            * other operators: **$where, $comment**
        * **sorter** is supported
        * **field selection** is supported
        * **skip** and **limit** options are supported
        * **sqlScn** option has been added to support **flashback queries**
    * insert() operations are translated into **INSERT INTO ...**
    * remove() operations are translated into **DELETE FROM ...**
    * update() operations are translated into **UPDATE ... SET ...**
        * basic operators $inc, $set, $unset are supported
    * drop() operations are translated into **DROP TABLE**
    * ensureIndex() operations are translated into **CREATE INDEX**
    * drop() operations are translated into **DROP TABLE**
    * dropIndex() operations are translated into **DROP INDEX**
* **Elastic Data Model**
    * the driver automatically creates and modifies **data tables** based on structure and size of data
    * the **primary key** constraint and related index is automaticaly created
    * the **new columns** are added automatically if needed
    * the **size** of the columns will be automatically augmented in new data would not fit
    * the **type** of columns gets automatically modified when possible
    * the **NULL/NOT NULL** constraint is automatically maintained
    * automatic conversion of **boolean** values to varchar2 (Oracle doesn't support boolean in their SQL language)
* **Oplog Tailing**
    * the driver creates **oplog table** in the meteor schema
    * automatic creation and maintenance of **database triggers** that populate the **oplog** table in real time

__Restrictons:__

* only linux environment is supported at this moment
* column data types have to be consistent
* nested data structures are not suported
* some operators in find() selector are not implemented yet
    * $maxDistance, $all, $near, $options, regexp inside $in or $nin, $size, $type
* some operators in update() selector are not implemented yet
    * $setOnInsert, $push, $pushAll, $addToSet, $pop, $pull, $pullAll, $rename, $bit, $elemMatch

### Future Improvements
* use node-oracledb connection pool
* use oracle resultsets to implement collection cursor 
* refresh table meta-data after any error occurred (maybe separate ORA errors should be considered)
* refresh table meta-data after any DDL change is made by an external entity 
* support strict mode (driver will not make any DDL changes in the database)
* support nested data structures
* design reactive joins

### License
Released under the MIT license. See the LICENSE file for more info.

__Copyright (c) 2015 AMI System LLC__
- - - 
### Detailed Installation Instructions
**Step 1:** Install or get access to **Oracle Database**

* It is very likely that you already have your Oracle database installed and this step can be skipped
* If that is not a case you can easily download and install free [Oracle Database 11g Express Edition](http://www.oracle.com/technetwork/database/database-technologies/express-edition/downloads/index.html).

**Step 2:** Install **Oracle Instant Client**

* **node_oracledb** package, which is used for all database operations, requires free Oracle Instant Client libraries.
    * See https://github.com/oracle/node-oracledb for more information about node.js package "node-oracledb"
* Detailed Installation Steps:
    * Go to http://www.oracle.com/technetwork/database/features/instant-client/index-097480.html
	* Choose the right Instant Client package for your platform
	* Accept Oracle's [OTN Development and Distribution License Agreement](http://www.oracle.com/technetwork/licenses/instant-client-lic-152016.html) for Instant Client
	* Find the version that matches your oracle database instance and download the corresponding zip file
		* Run sqlplus to determine the exact version of your database

```shell
$ sqlplus 

SQL*Plus: Release 11.2.0.2.0 Production on Mon Dec 14 16:08:49 2015

Copyright (c) 1982, 2011, Oracle.  All rights reserved.

Enter user-name: meteor
Enter password: 

Connected to:
Oracle Database 11g Express Edition Release 11.2.0.2.0 - 64bit Production

SQL> 
```

* (Detailed Installation Steps continued)
    * for example, for Oracle XE 11.2.0.2.0 on linux x64 you choose [instantclient-basic-linux-x86-64-11.2.0.2.0.zip](http://download.oracle.com/otn/linux/instantclient/112020/instantclient-basic-linux-x86-64-11.2.0.2.0.zip)
	* Login to your Oracle account. If you don't have one, you need to create it. It is free.
	* Unzip the downloded file into your workspace directory e.g. **~/workspace/**
	* The new subdirectory e.g. **~/workspace/instantclient_11_2** will be created
* Environment variable **LD_LIBRARY_PATH** has to be set accordingly
```shell
$ export LD_LIBRARY_PATH=${LD_LIBRARY_PATH}:~/workspace/instantclient_11_2
```
**Step 3:** Create a meteor account in your oracle database.
```
$ sqlplus sys as sysdba
create user meteor identified by meteor;
grant connect, resource to meteor;
```
Make sure that this user has privileges to use the default tablespace. In case of issues you can use the following command:
```
grant unlimited tablespace to meteor;
```
**Step 4:** Verify that your meteor account has been created:
```bash
$ sqlplus meteor/meteor

SQL*Plus: Release 11.2.0.2.0 Production on Mon Dec 14 17:37:40 2015

Copyright (c) 1982, 2011, Oracle.  All rights reserved.


Connected to:
Oracle Database 11g Express Edition Release 11.2.0.2.0 - 64bit Production

SQL> exit
```
**Step 4:** Add **meteor-oracle** package to your meteor project
```bash
$ cd <PATH-TO-YOUR-METEOR-PROJECT>
$ export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:<PATH-TO-YOUR-ORACLE-INSTANT-CLIENT>/instantclient_11_2/
$ meteor add metstrike:meteor-oracle
$ meteor
```
- - - 
### Get the Idea
Let's get back to the simple example we listed at the top of this document:
```javascript
var coll = new Oracle.Collection("todos");

coll.insert({name: "Get milk", priority:1, userId: "Jane"});

var rows = coll.find({priority:1}).fetch();

console.log(rows);
```
The **meteor-oracle** driver will not only generate the **insert** and **select** statements, it will also create database table (if it doesn't exist yet), its primary key constraint, and the trigger that will populate the **oplog** table. The complete list of generated SQL statements looks as follows:
```
create table "todos" ("_id" varchar2(17) not null)

alter table "todos" add constraint "todos_PK" primary key ("_id")

INSERT:  todos { name: 'Get milk', priority: 1, userId: 'Jane', _id: '46662dSw2KkzpNXqo' } { safe: true }

alter table "todos" add ("name" varchar2(8) not null) []
alter table "todos" add ("priority" number(1) not null) []
alter table "todos" add ("userId" varchar2(4) not null) []

create or replace trigger "todos_trg"
after insert or update or delete
on "todos"
for each row
declare
	op varchar2(1);
	ns varchar2(200);
	o varchar2(4000);
	o2 varchar2(4000);
begin
	IF INSERTING THEN
		op := 'i';
		ns := 'meteor@localhost/XE'||'.'||'todos';
		o := '';
		o := o || '"_id": "'||replace(replace(:NEW."_id", chr(10), '\n'), '"', '\"')||'"';
		o := o || ', ';
		o := o || '"name": "'||replace(replace(:NEW."name", chr(10), '\n'), '"', '\"')||'"';
		o := o || ', ';
		o := o || '"priority": '||nvl(meteor_pkg.js_number(:NEW."priority"), 'null');
		o := o || ', ';
		o := o || '"userId": "'||replace(replace(:NEW."userId", chr(10), '\n'), '"', '\"')||'"';
		o := '{'||o||'}';
		o2 := null;
		insert into "oplog" ("id", "ts", "scn", "tr", "v", "op", "ns", "o", "o2")
		values ("oplog_seq".nextval, current_timestamp, dbms_flashback.get_system_change_number, dbms_transaction.local_transaction_id, 2, op, ns, o, o2);
	ELSIF UPDATING THEN
		op := 'u';
		ns := 'meteor@localhost/XE'||'.'||'todos';
		o := '';
		IF (:NEW."name" <> :OLD."name" OR (:NEW."name" IS NOT NULL AND :OLD."name" IS NULL) 
		        OR (:NEW."name" IS NULL AND :OLD."name" IS NOT NULL)) THEN 
		    IF o is not null THEN  := o || ', '; END IF; 
            o := o || '"name": "'||replace(replace(:NEW."name", chr(10), '\n'), '"', '\"')||'"'; 
        END IF;
		IF (:NEW."priority" <> :OLD."priority" OR (:NEW."priority" IS NOT NULL AND :OLD."priority" IS NULL) 
		        OR (:NEW."priority" IS NULL AND :OLD."priority" IS NOT NULL)) THEN 
		    IF o is not null THEN o := o || ', '; END IF; 
		    o := o || '"priority": '||nvl(meteor_pkg.js_number(:NEW."priority"), 'null'); 
		END IF;
		IF (:NEW."userId" <> :OLD."userId" OR (:NEW."userId" IS NOT NULL AND :OLD."userId" IS NULL) 
		        OR (:NEW."userId" IS NULL AND :OLD."userId" IS NOT NULL)) THEN 
		    IF o is not null THEN o := o || ', '; END IF; 
		    o := o || '"userId": "'||replace(replace(:NEW."userId", chr(10), '\n'), '"', '\"')||'"'; 
        END IF;
		IF o is not null THEN
			o := '{"$set": {'||o||'}}';
		o2 := '';
		o2 := o2 || '"_id": "'||replace(replace(:OLD."_id", chr(10), '\n'), '"', '\"')||'"';
		o2 := '{'||o2||'}';
			insert into "oplog" ("id", "ts", "scn", "tr", "v", "op", "ns", "o", "o2")
			values ("oplog_seq".nextval, current_timestamp, dbms_flashback.get_system_change_number, dbms_transaction.local_transaction_id, 2, op, ns, o, o2);
		END IF;
	ELSIF DELETING THEN
		op := 'd';
		ns := 'meteor@localhost/XE'||'.'||'todos';
		o := '';
		o := o || '"_id": "'||replace(replace(:OLD."_id", chr(10), '\n'), '"', '\"')||'"';
		o := '{'||o||'}';
		o2 := null;
		insert into "oplog" ("id", "ts", "scn", "tr", "v", "op", "ns", "o", "o2")
		values ("oplog_seq".nextval, current_timestamp, dbms_flashback.get_system_change_number, dbms_transaction.local_transaction_id, 2, op, ns, o, o2);
	END IF;
 end;

INSERT INTO "todos" ("name", "priority", "userId", "_id") VALUES (:0, :1, :2, :3)
Parameters: [ 'Get milk', 1, 'Jane', '46662dSw2KkzpNXqo' ]

SELECT * FROM (SELECT * FROM "todos") WHERE "priority" = 1
```
- - -
The end of the document.
