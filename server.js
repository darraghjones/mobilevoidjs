
/**
 * Module dependencies.
 */

var express = require('express')
var app = express();
  
// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.locals.pretty = true;
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Routes
require('./routes')(app);

var port = process.env.port || 3000;
app.listen(port);	
console.log("Express server listening on port %d in %s mode", port, app.settings.env);
