echo "Please enter the system password";

sqlplus /nolog @sql/system.sql

sqlplus meteor/meteor @sql/meteor.sql
sqlplus meteor/meteor @sql/meteor_pkg.sql

