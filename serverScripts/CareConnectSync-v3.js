#!/usr/bin/env node

//CareConnect version 3 profiles...

var fs = require('fs');
var syncRequest = require('sync-request');

var upload = false;

//var remoteFhirServer = "http://fhirtest.uhn.ca/baseDstu2/";
//var remoteFhirServer = "http://snapp.clinfhir.com:8080/baseDstu2/";
var remoteFhirServer = "http://localhost:8080/baseDstu3/";

//var remoteFhirServer = "http://snapp.clinfhir.com:8081/baseDstu3/";   //the real one when ready...


//Create an implementation guide to hold the artifacts
var IG = {resourceType:'ImplementationGuide',status:'draft',package:[{name:'complete',resource:[]}]};
IG.id = 'cf-artifacts-cc3';
IG.description = "Care Connect Profiles";
IG.extension = [{url: "http://clinfhir.com/fhir/StructureDefinition/cfAuthor",valueBoolean:true}]

//var localFileRoot = __dirname;
var localFileRoot = "/Users/davidha/Dropbox/orion/careConnect3/CareConnect-profiles-feature-stu3/";

/* temp...
console.log('------ Uploading ValueSets -------')
var filePath = localFileRoot + "valuesets/";
var fileNames = getFilesInFolder(filePath);
uploadValueSets(remoteFhirServer,filePath,fileNames)

*/

console.log('------ Uploading CodeSystems -------')
var filePath = localFileRoot + "codesystems/";
var fileNames = getFilesInFolder(filePath);
uploadCodeSystem(remoteFhirServer,filePath,fileNames)



console.log('-------- Uploading StructureDefinitions --------')
var filePath = localFileRoot + "constraints/";
console.log(filePath);
var fileNames = getFilesInFolder(filePath);
var errors = uploadSD(remoteFhirServer,filePath,fileNames);
if (errors > 0) {
    console.log('-------------------------------------------------------')
    console.log(errors + ' errors')
    console.log('-------------------------------------------------------')
}




console.log('-------- Uploading ImplementationGuide --------');
var url = remoteFhirServer  + "ImplementationGuide/" + IG.id;
var success = uploadOneFile(url,IG)

if (! success) {
    console.log("Error saving ImplementationGuide.")
} else {
    console.log("Uploaded ImplementationGuide.")
}


function uploadSD(serverRoot,filePath,arFiles) {
    var errors = 0;
    arFiles.forEach(function (fileName) {


        var ar=fileName.split('-')
        var pathToFile = filePath + fileName;
        var contents = fs.readFileSync(pathToFile,{encoding:'utf8'})
        try {
            var json = JSON.parse(contents);
            var id = json.id;

            varIGEntry = {description:json.name,sourceReference:{reference:json.url}};
            IG.package[0].resource.push(varIGEntry);
            if (ar[0]== 'CareConnect') {
                //a profile
                varIGEntry.acronym = 'profile'
                if (! id) {
                    id = 'cc-' + ar[1];
                }
            } else {
                //an extension
                varIGEntry.acronym = 'extension'
                if (! id) {
                    id = ar[2] || ar[1];
                    id = id.replace('.json','')
                }
            }

            json.id = id;

            //now save to FHIR server
            var url = remoteFhirServer + "StructureDefinition/"+id;

            var success = uploadOneFile(url,json)
            if (! success) {
                errors++
            }

        } catch (ex) {
            console.log('error processing '+ fileName + " "+ ex)
        }

        return errors;

    })
}

function uploadCodeSystem(serverRoot,filePath,arFiles) {
    arFiles.forEach(function (fileName) {


        var ar=fileName.split('-')
        var pathToFile = filePath + fileName;
        var contents = fs.readFileSync(pathToFile,{encoding:'utf8'})
        try {
            var json = JSON.parse(contents);
            var id = json.id;
            if (! id) {
                id = 'cc-'+ ar[2];
            }

            varIGEntry = {acronym:'Terminology',description:json.name,sourceReference:{reference:json.url}};
            IG.package[0].resource.push(varIGEntry);

            //now save to FHIR server
            // console.log('---> ' + id)
            var url = remoteFhirServer + "CodeSystem/"+id;

            var success = uploadOneFile(url,json)

        } catch (ex) {
            console.log('error processing '+ fileName + " "+ ex)
        }



    })
}

function uploadValueSets(serverRoot,filePath,arFiles) {
    arFiles.forEach(function (fileName) {
        //console.log(fileName);

        var ar=fileName.split('-')
        var pathToFile = filePath + fileName;
        var contents = fs.readFileSync(pathToFile,{encoding:'utf8'})
        try {
            var json = JSON.parse(contents);
            var id = json.id;
            if (! id) {
                id = ar[2];
            }

            varIGEntry = {acronym:'Terminology',description:json.name,sourceReference:{reference:json.url}};
            IG.package[0].resource.push(varIGEntry);

            //now save to FHIR server
           // console.log('---> ' + id)
            var url = remoteFhirServer + "ValueSet/"+id;

            var success = uploadOneFile(url,json)

        } catch (ex) {
            console.log('error processing '+ fileName + " "+ ex)
        }



    })
}


function uploadOneFile(url,json) {
    //now save to FHIR server
    //console.log('---> ' + id)
    //var url = remoteFhirServer + "ValueSet/"+id;

    var options = {}
    options.body = JSON.stringify(json);
    options.headers = {"content-type": "application/json+fhir"}
    options.timeout = 20000;        //20 seconds

    var response = syncRequest('PUT', url, options);

    console.log(response.statusCode)
    if (response.statusCode !== 200 && response.statusCode !== 201) {

        console.log(response.body.toString())
        return false
    } else {
        console.log('uploaded '+ url)
        return true;
    }

}

//send all the xml files in the filepath to the indicated server (serverRoot)
//for now, only use json files to avoid duplication
function uploadFiles(serverRoot,filePath,arFiles,resourceType) {

    var errors = 0, count = 0;

    arFiles.forEach(function (fileName) {



        if (fileName.indexOf('.json')> -1) {     //only json for now

            var pathToFile = filePath+'/'+fileName;


            //console.log(pathToFile)
            var contents = fs.readFileSync(pathToFile,{encoding:'utf8'})

            try {
                var json = JSON.parse(contents);
                if (json.resourceType == resourceType) {
                    //make sure it is of the correct type
                    var err = validateResource(fileName,json)
                    if (err !== "") {
                        console.log(err);
                        errors++;
                    } else {

                        var ar = fileName.split('.');
                        var id = 'cf-' + ar[0];       //construct an id to use to store the file. This needs review!

                        id = id.substr(0,64);   //max length of a FHIR Id...

                        json.id = id;


                        //set the name property from the path if not an extension to make the logical model neater

                        var url = serverRoot + resourceType + "/" + id;
                        console.log('url=' + url)

                        var options = {};
                        //not we can't just use the contents loaded form the file as we may have altered it...
                        options.body = JSON.stringify(json);
                        options.headers = {"content-type": "application/json+fhir"}
                        options.timeout = 20000;        //20 seconds

                        /* temp

                         // console.log(options)
                         var response = syncRequest('PUT', url, options);
                         //console.log(response)
                         console.log(response.statusCode)
                         if (response.statusCode !== 200 && response.statusCode !== 201) {
                         errors++
                         console.log(response.body.toString())
                         } else {

                         count ++
                         }

                         */

                        //update the list ?keep this
                        //  var entry={item: {reference:resourceType + "/" + id,display:id}}
                        // List.entry.push(entry)

                        //update the IG
                        var purpose,description;
                        description = json.description;
                        switch (resourceType) {
                            case 'ValueSet' :
                                purpose = 'terminology';
                                break;
                            case 'StructureDefinition':

                                //need to look at the resource contents to decide...

                                if (json.constrainedType == 'Extension') {
                                //if (fileName.indexOf('Extension') > -1) {
                                    purpose = 'extension'
                                } else {
                                    purpose = 'profile'
                                }
                        }

                        varIGEntry = {purpose:purpose,description:description,sourceReference:{reference:json.url}}
                        IG.package[0].resource.push(varIGEntry);
                        var response = syncRequest('PUT', url, options);
                        console.log('-->' + response.statusCode)
                        if (response.statusCode !== 200 && response.statusCode !== 201) {
                            errors++;
                            console.log(response.body.toString())
                        } else {
                            count ++
                        }

                    }



                }



            } catch(ex) {
                console.log('error: '+ ex + " (quite likely the file is not correct json)")
            }

        }







    })

    if (count > 0) {
        console.log('There were '+count + " files uploaded.")
    }

    if (errors > 0) {
        console.log("WARNING: there were "+errors + " errors...")
    }

    return;

}


function validateResource(fileName, json) {
    err = ""
    if (! json.url) {
        err += fileName + 'has no url'
    }
    return err;
}


function getFilesInFolder(path) {
    var ar = []
    fs.readdirSync(path).forEach(function(file) {
        ar.push(file)
        //console.log(file);
    })
    return ar;
}