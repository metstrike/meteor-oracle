
Package.describe({
  name: 'metstrike:meteor-oracle',
  version: '0.1.0',
  // Brief, one-line summary of the package.
  summary: 'Oracle Database Driver for Meteor',
  // URL to the Git repository containing the source code for this package.
  git: 'https://github.com/metstrike/meteor-oracle.git',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Npm.depends({
	'oracledb': '1.4.0'
});

Package.onUse(function(api) {
  api.export(['NpmModuleOracledb', 'NpmModuleOracledbVersion'], 'server');
  api.export(['OracleInternals', 'OracleDB', 'OracleTest', 'OracleSelector', 'OracleModifier', 'OracleSorter', 'OracleFields'], 'server');
  api.export(['Oracle'], ['client', 'server']);
  api.versionsFrom('1.1.0.3');
  api.use('underscore');
  api.use('callback-hook', 'server');
  api.use('mongo', ['client', 'server']);
  api.use('minimongo', 'server');
  api.use('ejson', 'server');
  api.use('ddp-server@1.2.1', 'server');
  api.addFiles('lib/server/wrapper.js', 'server');
  api.addFiles('lib/server/oracle_driver.js', 'server');
  api.addFiles('lib/server/remote_collection_driver.js', 'server');
  api.addFiles('lib/server/collection.js', ['client', 'server']);
  api.addFiles('lib/server/oracle_oplog_tailing.js', 'server');
  api.addFiles('lib/server/oracle_collection.js', 'server');
  api.addFiles('lib/server/oracle_db.js', 'server');
  api.addFiles('lib/server/oracle_selector.js', 'server');
  api.addFiles('lib/server/oracle_modifier.js', 'server');
  api.addFiles('lib/server/oracle_sorter.js', 'server');
  api.addFiles('lib/server/oracle_fields.js', 'server');
  api.addFiles('lib/server/helpers.js', 'server');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('metstrike:meteor-oracle');
  api.addFiles('lib/server/tests/oracle_tests.js', 'server');
  api.addFiles('lib/server/tests/oracle_db_tests.js', 'server');
  api.addFiles('lib/server/tests/collection_tests.js', 'server');
  api.addFiles('lib/server/tests/oracle_selector_tests.js', 'server');
  api.addFiles('lib/server/tests/oracle_modifier_tests.js', 'server');
  api.addFiles('lib/server/tests/oracle_sorter_tests.js', 'server');
  api.addFiles('lib/server/tests/oracle_fields_tests.js', 'server');
});
