/**
 * Feature flag util for CAPPS
 * ===========================
 *
 * Adding a flag
 * features -f MyFlagName -e TFFF -a
 *
 * Removing a flag
 * features -f MyFlagName -r
 *
 * Changing the flag status
 * features -f MyFlagName -e *F** -s true|false
 *
 * Options
 * =======
 * -f FlagName      Required flag name
 * -e TF*           Will set feature flags per environment (*|T|F) Dev|Test|Prod
 * -s true|false    Optional will set to true if not specified
 * -a               Optional Add flag
 * -r               Optional Remove flag
 *
 * Environment option
 * ==================
 * The -e will apply the enabled|disabled state to the environments
 *
 * ***
 * 123
 *
 * 1  Dev
 * 2  TEST
 * 4  Prod
 *
 * *  Don't modify flag state
 * T  Set flag state to true
 * F  Set flag state to false
 */
var exec = require('child_process').exec;
var Promise = require('bluebird');
var getopt = require('posix-getopt');
var fs = Promise.promisifyAll(require('fs'));
var Mustache = require('mustache');
var _ = require('lodash');
var constants = require('./lib/constants');

var environments = [
  constants.ENV_DEV,
  constants.ENV_TEST,
  constants.ENV_PROD
];

function getGitUser() {
  return new Promise(function (resolve, reject) {

    exec('git config user.name', function (error, stdout, stderr) {
      if (error !== null) {
        reject(error);
      }
      // strip character returns
      stdout = stdout.replace(/[^\w ]/gi, '');
      resolve(stdout);
    });
  });
}

function generateFeaturesJs(features) {

  var templateFile = __dirname + '/lib/features.mustache';
  var viewFile = __dirname + '/lib/features.generated.js';

  var template = fs.readFileSync(templateFile, { encoding: 'utf-8', flag: 'r'});

  var view = Mustache.render(template, features);

  fs.writeFileAsync(viewFile, view, { flag: 'w+'})
    .then(function() {
      console.log(viewFile + ' generated');
    })
    .catch(function(err) {
      console.error(err);
    })
}


function environmentFlag(opts, env) {

  var index = _.indexOf(environments, env);
  var setEnv = opts.environments ? opts.environments : 'T***';

  if (setEnv[index].toUpperCase() === 'T') {
    return true;
  }

  if (setEnv[index].toUpperCase() === 'F') {
    return false;
  }

  // no change
  return null;
}


function loadFeaturesFile(env) {
  var file = __dirname + '/config/features.' + env + '.json';

  if (!fs.existsSync(file)) {
    return null;
  }

  var features = fs.readFileSync(file, { encoding: 'utf-8', flag: 'r'});

  return JSON.parse(features);
}

function saveFeaturesToFile(features, env) {
  var file = __dirname + '/config/features.' + env + '.json';

  fs.writeFileAsync(file, JSON.stringify(features, null, '  '), { flag: 'w+'})
    .then(function() {
      console.log('Config ' + file + ' updated');

      if (env === 'dev') {
        generateFeaturesJs(features);
      }
    })
    .catch(function(err) {
      console.error(err);
    })
}

function findFeature(opts, features) {
    return _.find(features.Features, { name: opts.flag });
}

function addOrUpdateFeature(features, opts, user, flagEnabled) {

  // no change
  if (flagEnabled === null || flagEnabled === undefined) {
    return features;
  }

  var feature = {
    'name': opts.flag,
    'createdOn': new Date(),
    'createdBy': user,
    'updatedOn': null,
    'updatedBy': null,
    'enabled': flagEnabled
  };

  var existingFeature = findFeature(opts, features);

  if (existingFeature) {
    feature = existingFeature;
    feature.updatedBy = user;
    feature.updatedOn = new Date();
    feature.enabled = flagEnabled;
  } else {
    features.Features.push(feature);
  }

  return features;
}

function addFlag(opts) {

  getGitUser().then(function(user) {

    environments.forEach(function(env) {

      var features = loadFeaturesFile(env);

      if (features === null) {
        features = {
          Features: []
        };
      }

      var flagEnabled = environmentFlag(opts, env);

      // handle null (*)
      if (flagEnabled === null) {
        flagEnabled = false;
      }

      addOrUpdateFeature(features, opts, user, flagEnabled)

      saveFeaturesToFile(features, env);
    });

  });
}

function removeFlag(opts) {

  environments.forEach(function(env) {

    var features = loadFeaturesFile(env);

    if (features === null) {
      return;
    }

    _.remove(features.Features, function(feature) {
      return feature.name === opts.flag;
    });

    saveFeaturesToFile(features, env);
  });
}


function setFlag(opts) {
  getGitUser().then(function(user) {

    environments.forEach(function(env) {

      var features = loadFeaturesFile(env);

      if (features === null) {
        console.error('Features file is empty, use -a to add flag');
        process.exit(1);
        return;
      }

      var existingFeature = findFeature(opts, features);

      if (!existingFeature) {
        console.error('Can only SET flag status of existing flag, use -a to add flag');
        process.exit(1);
      }

      var flagEnabled = environmentFlag(opts, env);

      // no change skip
      if (flagEnabled === null) {
        return;
      }

      addOrUpdateFeature(features, opts, user, flagEnabled)

      saveFeaturesToFile(features, env);
    });

  });
}


function parseOptions() {
  var option;
  var opts = {  }
  var parser = new getopt.BasicParser('f:e:ars', process.argv);

  while ((option = parser.getopt()) !== undefined) {

    switch (option.option) {
      case 'f':
        opts.flag = option.optarg;
        break;

      case 'a':
        opts.add = true;
        break;

      case 'r':
        opts.remove = true;
        break;

      case 's':
        opts.set = true;
        break;

      case 'e':

        if (option.optarg.length < 4) {
          console.log('invalid option: "' + option.option + ' ' + option.optarg + '" specify 4 environments');
          process.exit(1);
          break;
        }

        opts.environments = option.optarg;
        break;

      default:
        console.error('invalid option: ' + option.option);
        process.exit(1);
        break;
    }
  }

  return (opts);
}


(function main() {
  var opts = parseOptions();

  if (opts.add) {
    addFlag(opts);
    return;
  }

  if (opts.remove) {
    removeFlag(opts);
    return;
  }

  if (opts.set) {
    setFlag(opts);
  }

})();
