/*
  This module exports an object with a single function, which
  if successful calls a callback function with the flickr API
  object as argument for further use.

  signature: authenticate(options, callback)

  options argument: {
    api_key: "your api key from flickr",
    secret: "your api key secret from flickr",
    requestOptions: "object containing any value accepted by request.defaults()" optional
    user_id: negotiated through first-time authenticate() call
    access_token: negotiated through first-time authenticate() call
    access_token_secret: negotiated through first-time authenticate() call
  }

  callback argument: function(err, result)
*/

module.exports = (function Flickr() {
  "use strict";

  var fs = require("fs"),
      request = require("request"),
      Utils = require("./utils"),
      RequestTokenFunction = require("./auth/request");

  /**
   * Check with Flickr whether we have a valid pre-existing access token
   */
  var checkToken = function(options, callback) {
    if(!options.access_token) {
      return callback(new Error("no access token"));
    }

    options = Utils.setAuthVals(options);
    var   url = "https://api.flickr.com/services/rest",
          method = "flickr.auth.oauth.checkToken",
          queryArguments = {
          method: method,
          oauth_consumer_key: options.api_key,
          oauth_nonce: options.oauth_nonce,
          oauth_timestamp: options.oauth_timestamp,
          oauth_signature_method: "HMAC-SHA1",
          oauth_token: options.access_token
        },
        queryString = Utils.formQueryString(queryArguments),
        data = Utils.formBaseString("GET", url, queryString),
        signature = Utils.sign(data, options.secret, options.access_token_secret),
        flickrURL = url + "?" + queryString + "&oauth_signature=" + signature;

    request.defaults(options.requestOptions).get(flickrURL, function(error, response, body) {
      if(error) {
        callback(error);
      }
      callback(null, true);
    });
  };

  /**
   * Request an access token from Flickr
   */
  var requestToken = function(options, callback) {
    var receivedToken = function(err,body) {
      if(err) {
        return callback(err);
      }
      var response = Utils.parseRestResponse(body);
      options.user_id = response.user_nsid;
      options.access_token = response.oauth_token;
      options.access_token_secret = response.oauth_token_secret;
      if (options.callback === "oob" && !options.silent) {
        console.log("\n\nAdd the following variables to your environment:\n");
        console.log("export FLICKR_USER_ID=\"" + options.user_id + "\"");
        console.log("export FLICKR_ACCESS_TOKEN=\"" + options.access_token + "\"");
        console.log("export FLICKR_ACCESS_TOKEN_SECRET=\"" + options.access_token_secret + "\"");
        console.log();
      }
      callback(false, {
        FLICKR_USER_ID: '"' + options.user_id + '"',
        FLICKR_ACCESS_TOKEN: '"' + options.access_token + '"',
        FLICKR_ACCESS_TOKEN_SECRET: '"' + options.access_token_secret + '"'
      });
    };
    new RequestTokenFunction(options, receivedToken);
  };

  /**
   * The authentication function will sign into flickr as
   * an app, obtaining authorization keys values if it
   * does not already have them.
   */
  var authenticate = function(options, next) {
    if(!options) {
      process.nextTick(function(){
        next(new Error("Please pass an valid Flickr API key and secret to the Flickr module.\n"+
                       "Visit http://www.flickr.com/services/apps/create/apply to get one."));
      });
      return;
    }

    // out-of-browser authentication unless specified otherwise
    if(!options.callback) { options.callback = "oob"; }
    if(!options.requestOptions) options.requestOptions = {};
    if(options.noenv && !options.credentialHandler) {
      console.err('You decided to not write auth info to env file (.env), so you need to provide' +
      'a credentialHandler function');
    }

    // effect authentication
    checkToken(options, function(err, access) {
      var APIBuilder = require("./flickr-api-object");
      if(!access) {
        requestToken(options, function(err, body) {
          if(options.callback !== "oob") {
            options.processCredentials = options.processCredentials || function(data) {
              // default function writes creds to .env
              if(!options.silent) {
                console.log("Credentials object:");
                console.log(JSON.stringify(data,null,2));
              }
              // write env, unless told not to
              if(!options.noenv) {
                var envContent = fs.readFileSync(".env") + "\n";
                Object.keys(data).forEach(function(key) {
                    envContent += "export " + key + "=" + data[key] + "\n";
                });
                fs.writeFileSync(".env", envContent);
              }

              // send credentials on for (additional) processing
              if(options.credentialHandler)
                // note that much earlier in the code, such as before
                // any real code in authenticate() is run, we may want to
                // verify that IF .noenv is set, then .credentialHandler
                // is also set. It would be silly to wait until this point in
                // the negotiation to throw an error if we have .noenv
                // but no .credentialHandler
                options.credentialHandler(data);
              }
            };
            options.processCredentials(body);
          }

          // is this auth only, or also API object creation?
          if(options.noAPI) {
            process.nextTick(function() { next(false); });
          }
          else { new APIBuilder(options, Utils, next); }
        });
      } else { new APIBuilder(options, Utils, next); }
    });
  };

  /**
   * If you only want to use the non-authenticated functions, you can bypass the oauth
   * authentication and simply never call auth-locked Flickr API functions.
   */
  var tokenOnly = function(options, next) {
    if(!options) {
      return next(new Error("Please pass an valid Flickr API key and secret to the Flickr module.\n"+
                            "Visit http://www.flickr.com/services/apps/create/apply to get one."));
    }

    if(!options.requestOptions) options.requestOptions = {};
    var APIBuilder = require("./flickr-api-object");
    options.tokenonly = true;
    new APIBuilder(options, Utils, next);
  };

  /**
   * The initial Flickr access point.
   */
  return {
    loadLocally: require("./handlers/ia"),
    tokenOnly: tokenOnly,
    authenticate: authenticate,
    downsync: require("./handlers/downsync"),
    upload: Utils.upload.bind(Utils)
  };

}());
