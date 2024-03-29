
module.exports = function (app) {
        
    var http = require('http')
    var htmlparser = require("htmlparser")
    var select = require('soupselect').select
    var util = require('util')
    //var params = require('express-params')
    var fs = require('fs')
    var crypto = require('crypto')
    var async = require('async')
    var azure = require('azure')

    app.get('/env', function (req, res) {
        res.send(util.inspect(process.env, false, null      ));
    });

    app.get('/clearCache', function(req, res) {
        var blobService = azure.createBlobService();
        blobService.deleteContainer('cache', function(err, result) {
            res.send(result);
        });
    });

    app.get('/play', function (req, res) {
        res.render('play', {url: req.query['url'], layout: false});
    });

   
    app.get(/^\/(power)?Search$/i, function (req, res) {
        getSearchResults(req.url, function(searchResults) {
            res.render('searchResults', { searchResults: searchResults });
        });
    });

        
    app.get(/^\/(mostDownloaded|hotReleases|justAdded)$/i, function (req, res) {        
        getAlbums(req.url, function(songs) {
           res.render('list', { songs: songs });
        });
    });

    app.get('/download-mp3/:artist/artist_:artistId', function (req, res) {
        getArtist(req.url, function(artist) {
            res.render('artist', { artist: artist });
        });
    });

    app.get('/download-mp3/:artist/:album/album_:albumId', function (req, res) {
        getAlbum(req.url, function(album) {
            res.render('album', { album: album });
        });
    });

    app.get('/download-mp3/:album/album_:albumId', function (req, res) {
        getAlbum(req.url, function(album) {
            res.render('album', { album: album });
        });
    });

    app.get('/', function (req, res) {        
        async.parallel(
        {
            artists: function(callback){
                getArtists('/mostDownloaded?period=Week&entity=Artist', function(results) {
                    callback(null, results)
                });
            },
            albums: function(callback){
                getAlbums('/mostDownloaded?period=Week&entity=Album', function(results) {
                    callback(null, results)
                });
            },
            songs: function(callback){
                getSearchResults('/mostDownloaded?period=Week&entity=Song', function(results) {
                    callback(null, results)
                });;
            }
        },
        function(err, results) {
           res.render('index', results);
        });        
    });




    process.env.AZURE_STORAGE_ACCOUNT = 'darraghruby'
    process.env.AZURE_STORAGE_ACCESS_KEY = 'BMPMD/hpYVqdYOIozwcxx2c/nrG1W1ynwkBW4SM4vmFwPACu2ktmLwZjw7rQ/eqTovPOORom7vxymUcev9LJUQ=='



    function getUrl(url, callback) {
        var md5 = crypto.createHash('md5');
        var hash = md5.update(url).digest('base64');

        var blobService;
        try {
            blobService = azure.createBlobService();
        } 
        catch (err) {
            blobService = null;
        }

        if (blobService) {
            blobService.createContainerIfNotExists('cache', function(err, results) {
                blobService.getBlobToText('cache', hash, function(err, text, result, response) {
                    if (text) {
                        var ageInMinutes = (new Date() - new Date(result.lastModified)) / (60 * 1000)
                        console.dir(ageInMinutes)
                        if (ageInMinutes < 60) {
                            console.log("blob storage cache hit: %s. %d minutes old.", hash, ageInMinutes);
                            callback(text);
                        }                        
                    }
                    downloadUrl(url, function (data) {
                        blobService.createBlockBlobFromText('cache', hash, data, function(err, results) {
                            callback(data);
                        });
                    });                       
                    
                });                
            });
        }
        else {
            var filename = 'cache/' + hash;
            fs.exists(filename, function (exists) {
                if (exists) {
                    console.log("filesystem cache hit: " + filename);
                    fs.readFile(filename, null, function (err, data) {
                        callback(data)
                    });
                }
                else {
                    downloadUrl(url, function (data) {
                        fs.writeFile(filename, data, function() {
                            callback(data);
                        });                    
                    });
                }
            });    
        }        
    }


    function downloadUrl(url, callback) {
        var options = {
            host: 'www.legalsounds.com',
            port: 80,
            path: url,
            method: 'GET'
        };
        console.log("downloading " + url)
                    
        var req = http.request(options, function (res) {
            var data = '';
            res.on('data', function (chunk) {
                data += chunk;
            });
            res.on('end', function () {
                callback(data);
            });
        });
        req.end();

    }

    function createDom(data) {
        var handler = new htmlparser.DefaultHandler()
        var parser = new htmlparser.Parser(handler);
        parser.parseComplete(data)
        return handler.dom;
    }

    function getArtist(url, callback) {
        getUrl(url, function(data) {
            var dom = createDom(data)
            var artist = {};
            var md = select(dom, "div.artistInfo div.name")[0].children[0].children[0];
            artist.name = md.raw;
            artist.albums = [];            
            select(dom, 'div.contentWrapper div.item').forEach(function(el) {
                var album = {}
                album.name = getText(el, 'div.name a');
                album.url = getHref(el, 'div.name a');
                artist.albums.push(album);
            });
            callback(artist);
        });        
    }

    function getAlbum(url, callback) {
        getUrl(url, function(data) {
            var dom = createDom(data)
            var album = {};
            //var md = select(dom, "div.albumInfo div.name")[0].children[0].children[0];
            //i(md);
            //album.name = md.raw;
            album.thumbnail = "http://legalsounds.com" + getImageSrc(select(dom, "div.albumInfo"), "div.thumbnail a img")
            album.songs = [];       
            var header = true;     
            select(dom, 'form table.content tr').forEach(function(el) {                
                if (header) {
                    header = false;                    
                }
                else {               
                    var song = {}
                    song.name = getText(el, 'td.name');
                    song.url = getFlashPreviewUrl(el, 'td.preview a');
                    album.songs.push(song);
                }
            });
            callback(album);
        });    
    }

    function getSearchResults(url, callback) {
        getUrl(url, function (data) {
            var dom = createDom(data)
            var md = select(dom, "form table.content tr");
            songs = [];
            header = true;
            md.forEach(function (element) {
                if (header) {
                    header = false;                    
                }
                else {
                    var songName = getText(element, "td.name");
                    var songUrl = getFlashPreviewUrl(element, "td.preview a");

                    var artistName = getText(element, "td.artist a");
                    var artistUrl = getHref(element, "td.artist a");

                    var albumName = getText(element, "td.album a");
                    var albumUrl = getHref(element, "td.album a");

                    songs.push({ 
                        artistName: artistName, 
                        artistUrl: artistUrl, 
                        albumUrl: albumUrl, 
                        albumName: albumName, 
                        songName: songName,
                        songUrl: songUrl});
                }                
            });
            callback(songs)
        });
    }

    function getText(el, sel, defaultText){  
        try {
            return select(el, sel)[0].children[0].raw.trim();
        }            
        catch(err){
            //console.log(err)
            return defaultText
        }
    }       
       

    function getHref(el, sel){
        try {
            return select(el, sel)[0].attribs.href
        }            
        catch(err){
            //console.log(err)
            return null;
        }
    }
        
        function getFlashPreviewUrl(el, sel){
        try {
            return select(el, sel)[0].attribs.flashPreviewUrl
        }            
        catch(err){
            //console.log(err)
            return null;
        }
    }
        

    function getImageSrc(el, sel){
        try {
            return select(el, sel)[0].attribs.src
        }            
        catch(err){
            //console.log(err)
            return null;
        }
    }
    
    function getAlbums(url, callback) {
        getUrl(url, function (data) {
            var dom = createDom(data)
            var md = select(dom, "div.contentWrapper div.item");
            songs = [];            
            md.forEach(function (element) {                

                var name = getText(element, "div.name a");
                var url = getHref(element, "div.name a");

                var artistName = getText(element, "div.artist a", "Various Artists");
                var artistUrl = getHref(element, "div.artist a");

                var imageUrl = getImageSrc(element, "div.thumbnail img");

                songs.push({ artistName: artistName, artistUrl: artistUrl, albumUrl: url, albumName: name, thumbnail: 'http://www.legalsounds.com' + imageUrl });
            });
            callback(songs)
        });
    }

    function getArtists(url, callback) {
        getUrl(url, function (data) {
            var dom = createDom(data)
            var md = select(dom, "div.contentWrapper div.item");
            results = [];            
            md.forEach(function (element) {                

                var name = getText(element, "div.name a");
                var url = getHref(element, "div.name a");

                results.push({ artistName: name, artistUrl: url});
            });
            //console.log(results)
            callback(results)
        });
    }



    function i(o) {
        console.log(o);
    }
}
