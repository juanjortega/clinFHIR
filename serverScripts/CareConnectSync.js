//upload conformance files in a folder structire to a FHOR server
//currently set for careconnect profiles
//works synchronously - easier to programme, and easier on the target server...

var fs = require('fs');
var syncRequest = require('sync-request');


//var remoteFhirServer = "http://fhirtest.uhn.ca/baseDstu2/";
var remoteFhirServer = "http://snapp.clinfhir.com:8080/baseDstu2/";

var List = {resourceType:'List',status:'current',mode:'snapshot',entry:[]};
List.title = "CareConnect profiles";
List.code = {coding:[{system:"http:clinfhir.com/fhir/CodingSystem/cfList",code:'confList'}],text:'clinFHIR conformance list'}
List.id = 'cf-artifacts-cc'

//Create an implementation guide to hold the artifacts
var IG = {resourceType:'ImplementationGuide',status:'draft',package:[{name:'complete',resource:[]}]};
IG.id = 'cf-artifacts-cc';
IG.description = "Care Connect"


console.log('------ Uploading ValueSets -------')
var filePath = __dirname + "/CareConnectAPI/ValueSets";
console.log(filePath);
var fileNames = getFilesInFolder(filePath);
uploadFiles(remoteFhirServer,filePath,fileNames,'ValueSet')


console.log('-------- Uploading StructureDefinitions --------')
var filePath = __dirname + "/CareConnectAPI/StructureDefinitions";
console.log(filePath);
var fileNames = getFilesInFolder(filePath);
uploadFiles(remoteFhirServer,filePath,fileNames,'StructureDefinition')

console.log(List)

console.log('-------- Uploading List --------')
//now save the List resource...
//var url = remoteFhirServer  + "List/" + List.id;
var url = remoteFhirServer  + "ImplementationGuide/" + IG.id;
var options = {};
//options.body = JSON.stringify(List);
options.body = JSON.stringify(IG);
//options.body =  body.replace(/(\r\n|\n|\r)/gm,"");
options.headers = {"content-type": "application/json+fhir"}
options.timeout = 20000;        //20 seconds
var response = syncRequest('PUT', url, options);
//console.log(response)

console.log(response.statusCode)
if (response.statusCode !== 200 && response.statusCode !== 201) {
    console.log("Error saving List:" + response.body.toString())
} else {

    console.log("List saved.")
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
                    var ar = fileName.split('.');
                    var id = 'cf-' + ar[0];       //construct an id to use to store the file. This needs review!

                    id = id.substr(0,64);   //max length of a FHIR Id...

                    json.id = id;

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
                    var entry={item: {reference:resourceType + "/" + id,display:id}}
                    List.entry.push(entry)

                    //update the IG
                    var purpose,description;
                    description = json.description;
                    switch (resourceType) {
                        case 'ValueSet' :
                            purpose = 'terminology';
                            break;
                        case 'StructureDefinition':

                            if (fileName.indexOf('Extension') > -1) {
                                purpose = 'extension'
                            } else {
                                purpose = 'profile'
                            }
                    }

                    varIGEntry = {purpose:purpose,description:description,sourceReference:{reference:json.url}}
                    IG.package[0].resource.push(varIGEntry);


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


function getFilesInFolder(path) {
    var ar = []
    fs.readdirSync(path).forEach(function(file) {
        ar.push(file)
        //console.log(file);
    })
    return ar;
}