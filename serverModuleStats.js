
let db;


var moment = require('moment');


function setup(app,indb) {

    db = indb;

//when a user navigates to cf

    app.post('/stats/login',function(req,res){

        var body = '';
        req.on('data', function (data) {
            body += data;

        });

        req.on('end', function () {
            var jsonBody = {};
            //just swallow errors for now
            try {
                jsonBody = JSON.parse(body);
            } catch (ex) {}

            recordAccess(req,jsonBody);
            res.end('ok');
        });

    });


//get a summary of the access stats. This code is rather crude - mongo has better ways of doing this...
//probably want to be able to specify a date range and number of detailed items  as well...
    app.get('/stats/summary',function(req,res){
        if(! db) {
            //check that the mongo server is running...
            res.json({});
            return;
        }

        var query = {};

        var min = req.query.min;
        var max = req.query.max;

        if (min) {

            query.date = {$gte : parseInt(min),$lte:parseInt(max)}
        }

        db.collection("accessAudit").find({$query: query}).toArray(function(err,doc){
            if (err) {
                res.status(500);
                res.json({err:err});
            } else {
                var rtn = {cnt:doc.length,item:[],country:{},lastAccess : {date:0},module:{}};
                var daySum = {};



                doc.forEach(function(d,inx){

                    if (d.data) {
                        if (d.data.module) {
                            var m = d.data.module;
                            var dataServer,confServer,termServer;
                            if (d.data.servers) {
                                dataServer = d.data.servers.data;
                                termServer = d.data.servers.terminology;
                                confServer = d.data.servers.conformance;
                            }

                            if (rtn.module[m]) {
                                rtn.module[m].cnt++;

                                updateServerCount(dataServer,'data',rtn.module[m])
                                updateServerCount(termServer,'term',rtn.module[m])
                                updateServerCount(confServer,'conf',rtn.module[m])

                            } else {
                                rtn.module[m] = {cnt:1};
                                updateServerCount(dataServer,'data',rtn.module[m])
                                updateServerCount(termServer,'term',rtn.module[m])
                                updateServerCount(confServer,'conf',rtn.module[m])

                            }

                        }
                    }

                    if (d.date > rtn.lastAccess.date) {
                        rtn.lastAccess = d;
                    }


                    if (d.location) {
                        var c = d.location['country_code'];
                        if (c) {
                            if (!rtn.country[c]) {
                                rtn.country[c] = {name: d.location['country_name'], cnt: 0}
                            }
                            rtn.country[c].cnt++;
                        }
                    }

                    var day = moment(d.date).startOf('day').valueOf();
                    if (! daySum[day]) {
                        daySum[day] = 0;
                    }
                    daySum[day] ++;


                });

                rtn.daySum = [];

                for (var day in daySum) {
                    rtn.daySum.push([parseInt(day),daySum[day]]);
                }

                rtn.daySum.sort(function(a,b){
                    if (a[0] > b[0]){
                        return 1
                    } else {
                        return -1;
                    }
                });

                //now create an array of countries - easier for sorting
                rtn.countryList = [];
                for (var c in rtn.country) {
                    rtn.countryList.push(rtn.country[c])

                }

                //and sort it...
                rtn.countryList.sort(function(a,b){
                    if (a.cnt < b.cnt) {
                        return 1
                    } else {
                        return -1
                    }
                });

                rtn.moduleList = []
                for (var m in rtn.module) {



                    rtn.moduleList.push({name:m,cnt : rtn.module[m].cnt,detail:rtn.module[m]})
                }
                rtn.moduleList.sort(function(a,b){
                    if (a.cnt < b.cnt) {
                        return 1
                    } else {
                        return -1
                    }
                });


                res.json(rtn);


            }
        })



    });




    app.post('/errorReport',function(req,res){
        if(! db) {
            //check that the mongo server is running...
            res.json({});
            return;
        }
        var clientIp = req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            req.connection.socket.remoteAddress;

        var body = '';
        req.on('data', function (data) {
            body += data;
            console.log("Partial body: " + body);
        });

        req.on('end', function () {

            var jsonBody = JSON.parse(body);

            jsonBody.ip = clientIp;
            jsonBody.date = new Date().getTime();
            db.collection("errorLog").insert(jsonBody, function (err, result) {
                if (err) {
                    console.log('Error logging error ',audit)
                    res.end();
                } else {

                    res.end();

                }
            });
        });
    });



//return all results
    app.get('/errorReport/distinct',function(req,res){
        if(! db) {
            //check that the mongo server is running...
            res.json({});
            return;
        }

        db.collection("errorLog").distinct("resource.resourceType",function(err,doc){
            if (err) {
                console.log('Error logging error ',audit)
                res.end();
            } else {
                res.json(doc)

            }
        });
    });



//return all results
    app.get('/errorReport/:type?',function(req,res){


        var qry = {};
        if (req.params.type) {
            qry = {"resource.resourceType":req.params.type}
        }

        if (db) {
            db.collection("errorLog").find(qry).sort({date:-1}).toArray(function(err,doc){
                if (err) {
                    console.log('Error logging error ',audit)
                    res.end();
                } else {
                    res.json(doc)

                }
            });
        } else {
            res.json({})
        }

    });


    var updateLocation = function(doc,ip) {
        //doc.ip="198.102.235.144"
        var url = "http://freegeoip.net/json/"+doc.ip;

        var options = {
            method:'GET',
            uri : "http://freegeoip.net/json/"+doc.ip
        };

        request(options,function(error,response,body){

            if (body) {
                var loc;
                try {
                    loc = JSON.parse(body);
                } catch (ex) {}
                if (loc) {
                    db.collection("accessAudit").update({_id:doc._id},{$set:{location:loc}},function(err,doc){
                        if (err) {
                            console.log('Error setting location',err)
                        } else {

                            chatModule.addActivity({display:"login from "+loc['country_name'],data:loc,ip:ip});
                        }

                    })
                }

            }
        });


    };



}

function updateServerCount(serverName,type,obj) {
    if (serverName) {
        var key = type+'Server'
        obj[key] = obj[key] || {};
        var o = obj[key];
        o[serverName] = o[serverName] || {cnt:0}
        o[serverName].cnt++


    }
}


function recordAccess(req,data) {
    var clientIp = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    if (db) {
        var audit = {ip:clientIp,date:new Date().getTime()};
        audit.data = data;


        db.collection("accessAudit").insert(audit, function (err, result) {
            if (err) {
                console.log('Error logging access ',audit)
            } else {

                if (result && result.length) {
                    updateLocation(result[0],clientIp);

                }
            }
        });

    }
}



module.exports= {
    setup : setup
}