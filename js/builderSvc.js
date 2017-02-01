angular.module("sampleApp")
//this returns config options. At the moment it is for servers...
//also holds the current patient and all their resources...
//note that the current profile is maintained by resourceCreatorSvc

    .service('builderSvc', function($http,$q,appConfigSvc,GetDataFromServer,Utilities,$filter) {

        var gAllReferences = []
        var gSD = {};   //a has of all SD's reas this session by type
        var showLog = false;
        var gAllResourcesThisSet = {};      //hash of all resources in the current set
        var manualMarkerString = "<a name='mm'/>";     //a marker string to separate manually entered text (above the marker) from generated text below
        var baseHl7ConformanceUrl = "http://hl7.org/fhir/";
        var gCurrentResource;       //the current resource being examined

        //return the profile url of the current resource. This is needed for getEDInfoForPath() and assumes we're tracking the current resource...
        var getProfileUrlCurrentResource = function() {
            var profileUrl = baseHl7ConformanceUrl+"StructureDefinition/"+gCurrentResource.resourceType;
            if (gCurrentResource && gCurrentResource.meta && gCurrentResource.meta.profile) {
                profileUrl= gCurrentResource.meta.profile[0]
            } else {

            }
            return profileUrl;

        };

        //get the url for the SD of a resource. Default to the 'core' spec, but check the meta element...
        var getProfileUrlFromResource = function(resource) {
            var profileUrl = baseHl7ConformanceUrl+"StructureDefinition/"+resource.resourceType;
            if (resource && resource.meta && resource.meta.profile) {
                profileUrl= resource.meta.profile[0]
            } else {

            }
            return profileUrl;

        };

        var objColours ={};
        objColours.Patient = '#93FF1A';
        objColours.Composition = '#E89D0C';
        objColours.List = '#ff8080';
        objColours.Observation = '#FFFFCC';
        objColours.Practitioner = '#FFBB99';
        objColours.MedicationStatement = '#ffb3ff';
        objColours.CarePlan = '#FF9900';
        objColours.CareTeam = '#FFFFCC';
        objColours.Condition = '#cc9900';
        objColours.LogicalModel = '#cc0000';

        return {
            sendToFHIRServer : function(bundle) {
                //create a new bundle to submit as a transaction. excludes logical models
               // var deferred = $q.defer();
                var transBundle = {resourceType:'Bundle',type:'transaction',entry:[]}
                bundle.entry.forEach(function(entry) {

                    if (entry.isLogical) {
                        console.log('Ignoring Logical Model: ' + resource.resourceType)
                    } else {
                        var transEntry = {resource:entry.resource};
                        transEntry.request = {method:'PUT',url:entry.resource.resourceType+'/'+entry.resource.id}
                        transBundle.entry.push(transEntry)
                    }
                });

                console.log(transBundle)


                var url = appConfigSvc.getCurrentDataServer().url;
                return $http.post(url,transBundle)


             //   deferred.resolve()

               // return deferred.promise

            },
            validateAll : function(bundle) {
                var deferred = $q.defer();
                var queries = [];

                bundle.entry.forEach(function(entry){

                    if (entry.isLogical) {
                        console.log('Ignoring Logical Model: '+resource.resourceType)
                    } else {
                        queries.push(
                            Utilities.validate(entry.resource).then(
                                function(data){
                                    var oo = data.data;
                                    console.log(data)
                                    entry.valid='yes'
                                    entry.response = {outcome:oo};


                                },
                                function(data) {
                                    var oo = data.data;
                                    entry.response = {outcome:oo};
                                    // console.log(oo)
                                    entry.valid='no'

                                }
                            )
                        )
                    }



                })

                $q.all(queries).then(
                    function () {
                        deferred.resolve();
                    },
                    function (err) {


                        console.log( angular.toJson(err))
                        deferred.reject()


                    }
                )

                return deferred.promise;

            },
            getPatientResource : function(){
                var patient;
                angular.forEach(gAllResourcesThisSet,function(res){
                    if (res.resourceType == 'Patient') {
                        patient = res;
                    }
                   // console.log(res);
                })
                return patient
            },
            makeLogicalModelFromSD : function(profile){
              //given a StructureDefinition which is a profile (ie has extensions) generate a logical model by de-referencing the extensions
              //currently only working for simple extensions
                var deferred = $q.defer();
                if (profile && profile.snapshot && profile.snapshot.element) {

                    var logicalModel = angular.copy(profile);       //this will be the logical model
                    var queries = [];       //the queries to retrieve the extension definition
                    logicalModel.snapshot.element.length = 0; //remove the current element definitions

                    profile.snapshot.element.forEach(function (ed) {
                        logicalModel.snapshot.element.push(ed)
                        var path = ed.path;
                        var ar = path.split('.');
                        if (ar.indexOf('extension') > -1) {
                            //this is an extension
                            //console.log(ed);
                            if (ed.type) {
                                var profileUrl = ed.type[0].profile;
                                if (profileUrl) {
                                    queries.push(GetDataFromServer.findConformanceResourceByUri(profileUrl).then(
                                        function (sdef) {
                                            //console.log(ed,sdef)
                                            //locate the entry in the ED which is 'valueX' and update the ed. todo - need to accomodate complex extensions
                                            if (sdef && sdef.snapshot && sdef.snapshot.element) {
                                                sdef.snapshot.element.forEach(function (el) {
                                                    if (el.path.indexOf('.value') > -1) {
                                                        ed.type = el.type;

                                                        //now update the path and other key properties of the ed
                                                        var text = $filter('getLogicalID')(profileUrl);

                                                        ed.path = ed.path.replace('extension',text)
                                                        //ed.builderMeta || {}
                                                        ed.builderMeta = {isExtension : true};  //to colourize it, and help with the build..
                                                        ed.builderMeta.extensionUrl = profileUrl;

                                                        ed.comments = sdef.description;     //to be eble to show the description on the screen..

                                                    }

                                                })

                                            }

                                        }
                                    ))
                                }

                            }

                        }
                        //console.log(path)

                    });

                    if (queries.length > 0) {
                        //yes - execute all the queries and resolve when all have been completed...
                        $q.all(queries).then(
                            function () {
                                deferred.resolve(logicalModel);
                            },
                            function (err) {


                                console.log( angular.toJson(err))


                            }
                        )

                    } else {
                        //no - we can return the list immediately...
                        deferred.resolve(logicalModel)

                    }



                } else {
                    deferred.reject();
                }

                return deferred.promise;

            },
            setCurrentResource : function(resource) {
                gCurrentResource = resource;


            },
            analyseInstanceForPath : function(resource,path){
                //analyse the path. if it has an ancestor of type backbone element that is multiple, then show the current entries in the instance
                var that = this;
                var ar = path.split('.');
                var arExistingElements = []
                var testPath;
                var currentTestPoint = resource;           //where we are checking...

                var testPath = ar[0]
                var response = {path:path};
                for (var inx=1; inx < ar.length-1; inx++) {
                    var segment = ar[inx];
                    testPath += '.' + segment

                    var info = that.getEDInfoForPath(testPath);

                    if (info.isBBE ) {
                        //if it's a BBE, then is it one that can have multiple children? Note: This algorithm will not work on deeply nested paths...
                        if (info.isMultiple) {
                            //the path being passed in has an ancestor that is a multiple bbe. We need to get the existing elements at this path
                            //afaik this will always be directly off the root -todo: might want to check
                            arExistingElements = currentTestPoint[segment] || []
                            response.isMultipleBbe = true;          //indicates that this element does belonge to a repreating bbe (even if the list is currently empty)
                            if (currentTestPoint) {
                                currentTestPoint = currentTestPoint[segment]

                            }
                        } else {
                            // ?? do what
                        }

                    }





                }

                if (! currentTestPoint) {
                    //a parent node doesn't exist. return an empty array for the list - this will trigger a message to create the path first...
                    response.list = [];
                    response.modelPoint=resource;


                } else {
                    response.list = arExistingElements;
                    response.modelPoint=currentTestPoint;
                    //return both the list of nodes that are parents to this element, as well as the position in the instance where it was found (so new ones can be added)

                }

                return response;


            },
            isEmptyText : function(text){
                //return true if the text is empty

                if (text == "<div xmlns='http://www.w3.org/1999/xhtml'>" + this.getManualMarker() + "</div>") {
                    return true
                } else {
                    return false;
                }


            },
            splitNarrative : function(narrative) {

                //get the manual part of resource text - the text above the marker string. default to manual text..
                //assume that the narrative MAY be surrounded by <div> tags...

                var raw = $filter('cleanTextDiv')(narrative);       //the raw text - with 'divs' removed if they are present


                var generated='',manual = raw;

                var g = raw.indexOf(manualMarkerString);
                if (g > -1) {
                    manual = raw.substr(0,g);
                    generated = raw.substr(g+manualMarkerString.length);
                }

                //manual = manual.substr(raw)

                return {manual:manual,generated:generated}
            },
            getManualMarker : function() {
                return manualMarkerString;
            },
            addGeneratedText:function(manualText,generatedText){
                //create a narrative text surrounded by divs. \
                //assume that 'plain text' is input - returns narrative surrounded by 'divs'
                var narrative = manualText + manualMarkerString + generatedText;


                return $filter('addTextDiv')(narrative);




            },
            generateSectionText : function(section) {

                //construct section text from the text of all resources directly in the section.
                //for each resource in the section, if it is a List then construct the text from the text of the
                //immediate children. Otherwise just use the text of the resource.

                //generate the text for a section. todo - needs to become recursive...
                //console.log(gAllReferences)
                var html = "";
                var that = this;
                section.entry.forEach(function(entry){
                    //console.log(entry)
                    var resource = that.resourceFromReference(entry.reference);

                    if (resource) {
                        if (resource.resourceType == 'List') {
                            //get the text from all of the references resoruces...
                            var manual = that.splitNarrative(resource.text.div).manual;  //manually entered text
                            var generated = "";     //will replace the genereated text...


                            //resource.text.div = $filter('addTextDiv')(result.userText + builderSvc.getManualMarker() + vo.generated);

                            if (resource.entry) {
                                resource.entry.forEach(function(entry){
                                    //var ref = entry.item.reference;
                                    var refResource = that.resourceFromReference(entry.item.reference);
                                    if (refResource) {
                                        html += refResource.text.div;
                                        //add the text of the referenced element to the list...
                                        //var raw = $filter('cleanTextDiv')(refResource.text.div)

                                        //we only want the manually entered text...
                                        generated += that.splitNarrative(refResource.text.div).manual;  //manually entered text
                                        //generated +=  $filter('cleanTextDiv')(refResource.text.div);

                                    }

                                })
                            }

                            //var t = resource.text.div;

                            resource.text.div = that.addGeneratedText(manual,generated);






                        } else {
                            html += resource.text.div
                        }


                    }


                })

                section.text = html;
                return html;


                //function getText(text,)


            },
            resourceFromReference : function(reference) {
                //get resource from a reference
                return gAllResourcesThisSet[reference]
            },
            setAllResourcesThisSet : function(allResourcesBundle) {
                //create the hash of all resources in this set;
                var that = this;
                gAllResourcesThisSet = {};
                allResourcesBundle.entry.forEach(function(entry){
                    var resource = entry.resource;
                    gAllResourcesThisSet[that.referenceFromResource(resource)] = resource;

                });
            },
            setPatient : function(resource,SD) {
                //if there's a Patient resource already, then scan for 'subject' or 'patient' properties...
                var that = this;
                var Patient = null;
                angular.forEach(gAllResourcesThisSet,function(value,key){
                    //console.log(value,key)
                    if (value.resourceType == 'Patient') {
                        Patient = value;
                    }
                });

                if (Patient) {
                    //so there is a patient resource - does this resource have a 'patient' or 'subject' property?
                    if (SD && SD.snapshot && SD.snapshot.element) {
                        for (var i=0; i < SD.snapshot.element.length; i++) {
                            var ed =  SD.snapshot.element[i];
                            var path = ed.path;
                            if (path.substr(-7) == 'subject' || path.substr(-7) == 'patient') {
                                //console.log(path);
                                that.insertReferenceAtPath(resource,path,Patient)
                                break;
                            }
                        }
                    }
                }
            },
            addResourceToAllResources : function(resource) {
                //add a new resource to the hash

                gAllResourcesThisSet[this.referenceFromResource(resource)] = resource;



            },
            makeDocumentText : function(composition,allResourcesBundle){
                //construct the text representation of a document
                // order is patient.text, composition.text, sections.text
                if (composition) {
                    var that = this;
                    var html = "";


                    //generate the composition text
                    //var cHtml = ';'

                    var manual = that.splitNarrative(composition.text.div).manual;  //manually entered text
                    var generated = "";     //will replace the genereated text...

                    //add generated text from resources...
                    var references = ['subject','encounter','author','custodian']
                    angular.forEach(composition,function(value,key){
                        //console.log(value,key);
                        var arResources = [];

                        if (references.indexOf(key) > -1) {

                            if (angular.isArray(value)) {
                                //var ar = value
                                value.forEach(function(el) {
                                    var r = that.resourceFromReference(el.reference)
                                    arResources.push(r)
                                })
                            } else {
                                arResources.push(that.resourceFromReference(composition[key].reference))
                            }



                        }

                        //this was a resource reference
                        if (arResources.length > 0) {
                            arResources.forEach(function(resource){
                                if (resource) {
                                    generated += "<div><strong class='inset'>"+key+": </strong>" + that.splitNarrative(resource.text.div).manual + "</div>";
                                }

                            })

                        }



                    });

                    composition.text.div = that.addGeneratedText(manual,generated);

                    html += "<h3>Composition</h3>" + "<div class='inset'>"+ composition.text.div + "</div>";

                    html += "<h3>Sections</h3>";

                    composition.section.forEach(function(section){
                        //console.log(section);


                        html += "<h4>"+section.title+"</h4>";
                        html += "<div class='inset'>";

                        html += that.generateSectionText(section)
                        html += "</div>";



                    })

                    return html;
                }





            },
            referenceFromResource : function(resource) {
                //create the reference from the resource
                return resource.resourceType + "/" + resource.id;
            },
            getLibraryCategories : function(){
                //the categories on the current library server/ ?Use the DR.class propertu to record?

                var lst = [];
                lst.push({cateto:''})
            },
            saveToLibrary : function (bundleContainer,user) {
                //save the bundle to the library. Note that the 'container' of the bundle (includes the name) is passed in...

                console.log(user)

                var bundle = bundleContainer.bundle;

                //remove all the 'valid' propertis on entry...
                bundle.entry.forEach(function (entry) {
                    delete entry.valid;
                });


                var docref = {resourceType:'DocumentReference',id:bundle.id};
                docref.type = {coding:[{system:'http://clinfhir.com/docs',code:'builderDoc'}]};
                docref.status = 'current';
                docref.indexed = moment().format();
                docref.description = bundleContainer.name;  //yes, I know these names are confusing...


                if (user) {
                    //todo - add Practitioner stuff as well...
                    docref.author = {display:user.user.email}
                }

                var extensionUrl = appConfigSvc.config().standardExtensionUrl.docrefDescription;
                Utilities.addExtensionOnce(docref,extensionUrl,{valueString:bundleContainer.description})

                if (bundleContainer.isPrivate) {
                    docref.meta = {security : [{code:'R',system:'http://hl7.org/fhir/v3/Confidentiality'}]}
                }
                docref.content = [{attachment:{data:btoa(angular.toJson(bundle))}}]
                var url = appConfigSvc.getCurrentDataServer().url + 'DocumentReference/'+docref.id;
                return $http.put(url,docref);

            },
            getBundleContainerFromDocRef : function(dr){
                //generate a bundleContainer (how the bundle is stored locally) from a documentreference...

                if (dr && dr.content && dr.content[0] && dr.content[0].attachment && dr.content[0].attachment.data) {
                    var container = {};
                    container.bundle = angular.fromJson(atob(dr.content[0].attachment.data));

                    //create the summary of resources in the container
                    container.resources = [];       //this will be a sorted list (by type) ...
                    var obj = {}
                    if (container.bundle.entry) {
                        container.bundle.entry.forEach(function(entry){
                            var resourceType = entry.resource.resourceType;
                            if (obj[resourceType]) {
                                obj[resourceType].count++
                            } else {
                                obj[resourceType] = {type:resourceType,count:1}
                            }
                        })
                    }

                    for (var o in obj) {
                        container.resources.push(obj[o])
                    }
                    container.resources.sort(function(a,b){
                        if (a.type < b.type) {
                            return 1
                        } else {
                            return -1
                        }
                    });
                    container.author = dr.author;

                    if (dr.meta) {
                        container.lastUpdated = dr.meta.lastUpdated;
                        container.version = dr.meta.versionId
                    }



                    container.name = dr.description;
                    container.url = appConfigSvc.getCurrentDataServer().url + "DocumentReference/"+dr.id;
                    //container.description = dr.description;

                    //the description is stored in an extension - the dr.description filed is actually the set name...
                    var extensionUrl = appConfigSvc.config().standardExtensionUrl.docrefDescription;
                    var ext = Utilities.getSingleExtensionValue(dr,extensionUrl);
                    if (ext && ext.valueString) {
                        container.description = ext.valueString;  //yes, I know these names are confusing...
                    }


                    container.isDirty = false;
                    //get the security tags.
                    if (dr.meta && dr.meta.security) {
                        dr.meta.security.forEach(function(coding){
                            if (coding.system='' && coding.code == 'R') {
                                container.isPrivate = true;
                            }
                        })
                    }
                    return container;


                }


            },
            loadLibrary : function (builderBundles) {
                //download ALL the DocumentReferences that are the library references...
                var that = this;
                //create a hash for the current sets in the local cache based on id...
                //determine which are already stored loca
                var cache = {};
                if (builderBundles) {
                    builderBundles.forEach(function(bundle){
                        cache[bundle.bundle.id] = true;
                    });
                }



                var deferred = $q.defer();
                var url = appConfigSvc.getCurrentDataServer().url + 'DocumentReference?type=http://clinfhir.com/docs|builderDoc';



                GetDataFromServer.adHocFHIRQueryFollowingPaging(url).then(

                //$http.get(url).then(
                    function (data) {
                        //console.log(data.data)
                        var bundle = data.data;
                        if (bundle && bundle.entry) {
                            var arContainer = []
                            bundle.entry.forEach(function(entry){
                                var dr = entry.resource;
                                var container = that.getBundleContainerFromDocRef(dr)
                                if (cache[dr.id]) {
                                    container.cachedLocally = true;
                                }

                                arContainer.push(container);  //saves the doc as a container...

                                //now see if the bundle in the DR is cached locally (the id of the dr is the same as the bundle
                                //var cachedLocally = false;
                                /*$localStorage.builderBundles.forEach(function (local) {
                                    if (local.bundle.id == dr.id) {
                                        dr.meta = dr.meta || {}
                                        dr.meta.cachedLocally = true;
                                    }
                                })
                                */
                            })
                        }




                        deferred.resolve(arContainer)

                    },function (err) {
                        console.log(err)
                        deferred.reject(err);
                    }
                )



                return deferred.promise;
            },
            getValueForPath : function(resource,inPath) {
                //return a string display for a path value. root only at this stage...
                var path = $filter('dropFirstInPath')(inPath);   //the path off the root
                var info = this.getEDInfoForPath(inPath)

                if (info.isBBE) {
                    return {raw:{},display:""}
                } else {
                    var rawValue = resource[path];
                    if (info.isMultiple && resource[path]) {
                        rawValue = resource[path][0];
                    }
                    var display = "";
                    if (rawValue) {
                        display = rawValue;

                        //figure out the display
                        if (rawValue.coding) {
                            //this is a cc
                            display = rawValue.coding[0].display;
                            //display = rawValue.coding[0].code + " ("+rawValue.coding[0].system+")";
                        } else if (rawValue.start || rawValue.end) {
                            //this is a period

                        }
                    }




                    return {raw:rawValue,display:display}
                }




            },
            addStringToText : function(resource,txt) {
                //add the txt to the resource.text.div element...
                if (resource.text && resource.text.div) {

                    //strip off the leading resource type
                    var g = txt.indexOf('.');
                    if (g > -1) {

                        txt = txt.substring(g+1)
                    }


                    var vo = this.splitNarrative(resource.text.div)
                    var manual = vo.manual + txt;
                    resource.text.div = this.addGeneratedText(manual,vo.generated);

                }

            },
            addPropertyValue : function(insertPoint,hashPath,dt,value) {
                //add a value at the insertPoint (eg the resource root).
                // the last segment of hashPath.path is the actual propertyname. (we need to full path to get the ED)
                // type of value will depend on datatype
                var that = this;
                var info = this.getEDInfoForPath(hashPath.path)
                //for now, we only allow values for properties directly off the root...

                var path = hashPath.path;

                switch (dt) {

                    case 'ContactPoint':
                        var insrt = {value:value.contactpoint.value,system:value.contactpoint.system,use:value.contactpoint.use}
                        simpleInsert(insertPoint,info,path,insrt,dt);
                        this.addStringToText(insertPoint,path+": "+ insrt.value)
                        break;
                    case 'Identifier' :
                        var insrt = {value:value.identifier.value,system:value.identifier.system}
                        simpleInsert(insertPoint,info,path,insrt,dt);
                        this.addStringToText(insertPoint,path+": "+ insrt.value)
                        break;

                    case 'boolean' :
                       var v = value;
                        simpleInsert(insertPoint,info,path,value.boolean,dt);
                        this.addStringToText(insertPoint,path+": "+ v)
                        break;
                    case 'Annotation' :
                        var insrt = {text:value.Annotation.text,time:moment().format()}
                        simpleInsert(insertPoint,info,path,insrt,dt);
                        this.addStringToText(insertPoint,path+": "+ insrt.text)
                        break;

                    case 'HumanName' :
                        var insrt = {text:value.HumanName.text}
                        simpleInsert(insertPoint,info,path,insrt,dt);
                        this.addStringToText(insertPoint,path+": "+ insrt.text)
                        break;

                    case 'Address' :

                        var insrt = {text:value.Address.text}
                        simpleInsert(insertPoint,info,path,insrt,dt);
                        this.addStringToText(insertPoint,path+": "+ insrt.text)
                        break;

                    case 'Period' :
                        var start = value.period.start;
                        var end = value.period.end;
                        var insrt = {start:start,end:end}
                        simpleInsert(insertPoint,info,path,insrt,dt);

                        break;

                    case 'date' :
                        //value is a Date object...
                        var v = moment(value).format('YYYY-MM-DD');
                        simpleInsert(insertPoint,info,path,v,dt);
                        this.addStringToText(insertPoint,path+": "+ v)
                        break;
                    case 'dateTime' :
                        //value is a Date object...
                        var v = moment(value).format();
                        simpleInsert(insertPoint,info,path,v,dt);
                        this.addStringToText(insertPoint,path+": "+ v)
                        break;

                    case 'code' :
                        simpleInsert(insertPoint,info,path,value.code,dt);

                        this.addStringToText(insertPoint,path+": "+ value.code)
                        break;
                    case 'string' :
                        simpleInsert(insertPoint,info,path,value.string,dt);

                        this.addStringToText(insertPoint,path+": "+ value.string)
                        break;
                    case "CodeableConcept" :
                        //value is an object that can have properties code, system, display, text
                        var cc = {},text="";
                        if (value && value.cc) {

                            //when a CC is rendered as a set of radios the output is a json string...

                            if (angular.isString(value.cc)) {
                                value.cc = {coding:angular.fromJson(value.cc)}
                                delete value.cc.coding.extension;
                            }


                            if (value.cc.coding && value.cc.coding.code) {
                                cc.coding = [value.cc.coding]
                                if (value.cc.coding.display) {
                                    text = value.cc.coding.display
                                }
                            }
                            if (value.cc.text) {
                                cc.text = value.cc.text;
                                text = value.cc.text;
                            }

                            //if there was enough data for a cc to be generated...
                            if (cc.text || cc.coding) {
                                simpleInsert(insertPoint,info,path,cc,dt);

                                if (text) {
                                    this.addStringToText(insertPoint, path + ": " + text)
                                }
                            }

                        }

                        break;
                }

                function simpleInsert(insertPoint,info,path,insrt,dt) {

                    var elementInfo = that.getEDInfoForPath(path);  //information about the element we're about to insert...

                    var ar = path.split('.');
                    var propertyName = ar[ar.length-1];     //so we insert at insertPoint[propertyName]


                    //rename the propertyname if it can have different datatypes...
                    if (propertyName.substr(-3) == '[x]') {
                        var elementRoot = propertyName.substr(0,propertyName.length-3);     //the propertyname with the [x] removed

                        propertyName = elementRoot + dt.substr(0,1).toUpperCase() + dt.substr(1);   //the new property name

                        //delete any existing elements with this root
                        angular.forEach(insertPoint,function(value,key){
                            //console.log(key,value)
                            if (key.substr(0,elementRoot.length) == elementRoot) {
                                delete insertPoint[key]
                            }

                        })
                    }

                    //now do the actual insert...
                    if (elementInfo.isMultiple) {

                        insertPoint[propertyName] = insertPoint[propertyName] || []
                        insertPoint[propertyName].push(insrt)
                    } else {
                        //is this an extension?
                        if (info && info.isExtension) {

                            var dtValue = 'value' + info.extensionType.substr(0,1).toUpperCase() + info.extensionType.substr(1);
                            var ext = {}
                            ext[dtValue] = insrt
                            //var ext = {valueString:insrt};
                         //   if (angular.isObject(insertPoint)) {
                                Utilities.addExtensionOnceWithReplace(insertPoint,info.ed.builderMeta.extensionUrl,ext)
                           // } else {

                               // alert("Can't insert to simple ")
                         //   }


                        } else {
                            insertPoint[propertyName] =insrt;
                        }


                    }
                     //   insertPoint[propertyName] =insrt;
                }





                    return;

/*


                   // var segmentPath = resource.resourceType;
                    var path = $filter('dropFirstInPath')(path);


                    if (path.substr(-3) == '[x]') {
                        var elementRoot = path.substr(0,path.length-3);
                        path = elementRoot + dt.substr(0,1).toUpperCase() + dt.substr(1);

                        //delete any elements with this root
                        angular.forEach(insertPoint,function(value,key){
                            //console.log(key,value)
                            if (key.substr(0,elementRoot.length) == elementRoot) {
                                //console.log(key)
                                delete insertPoint[key]
                            }

                        })

                    }

                   // console.log(path)
                    //return;


                    var segmentInfo;
                    var ar = path.split('.');
                    if (ar.length > 0) {
                        for (var i=0; i < ar.length-1; i++) {
                            //not the last one... -
                            var segment = ar[i];

                            segmentPath += '.'+segment;
                            //console.log(segmentPath)

                            //segmentInfo = getInfo(segmentPath);
                            segmentInfo = that.getEDInfoForPath(segmentPath);



                            if (segmentInfo.isMultiple) {
                                insertPoint[segment] = insertPoint[segment] || []  // todo,need to allow for arrays
                                var node = {};
                                insertPoint[segment].push(node)
                                insertPoint = node
                            } else {
                                insertPoint[segment] = insertPoint[segment] || {}  // todo,need to allow for arrays
                                insertPoint = insertPoint[segment]
                            }




                        }
                        path = ar[ar.length-1];       //this will be the property on the 'last'segment
                    }

                    if (info.isMultiple) {

                        insertPoint[path] = insertPoint[path] || []
                        insertPoint[path].push(insrt)
                    } else {
                        insertPoint[path] =insrt;
                    }


                    *?
                }
            },
            removeReferenceAtPath : function(resource,path,inx) {
                //find where the reference is that we want to remove

                var ar = path.split('.');
                ar.splice(0,1);

                if (ar.length > 1) {
                    ar.pop();
                }
                path = ar.join('.')


                // var path = $filter('dropFirstInPath')(path);
                //path.pop();
                //console.log(resource,path,inx);
                if (inx !== undefined) {
                    var ptr = resource[path]
                    //delete ptr[inx]
                    ptr.splice(inx,1);
                } else {
                    delete resource[path]
                }





                /*
                 var info = this.getEDInfoForPath(path);

                 var segmentPath = resource.resourceType;
                 //var rootPath = $filter('dropFirstInPath')(path);
                 var path = $filter('dropFirstInPath')(path);
                 var deletePoint = resource;
                 var ar = path.split('.');
                 if (ar.length > 0) {
                 for (var i=0; i < ar.length-1; i++) {
                 //not the last one... -
                 var segment = ar[i];

                 segmentPath += '.'+segment;
                 console.log(segmentPath)

                 var segmentInfo = this.getEDInfoForPath(segmentPath);

                 if (segmentInfo.isMultiple) {
                 deletePoint[segment] = deletePoint[segment] || []  // todo,need to allow for arrays
                 var node = {};
                 deletePoint[segment].push(node)
                 deletePoint = node
                 } else {
                 deletePoint[segment] = deletePoint[segment] || {}  // todo,need to allow for arrays
                 deletePoint = deletePoint[segment]
                 }




                 }
                 path = ar[ar.length-1];       //this will be the property on the 'last'segment
                 }



                 console.log(insertPoint)

                 */

                if (inx) {

                }

            },
            insertReferenceAtPath : function(resource,path,referencedResource,insertPoint) {
                //insert a reference to a resource from a resource. If the insert point is passed in, then
                //add the reference at that point. Otherwise, start from the root of the resource and traverse
                //the path, adding parent elements (array or object) as required

                var info = this.getEDInfoForPath(path);
                var elementName;
                var path;
                if (insertPoint) {
                    //the element name will be the last se
                    var ar = path.split('.');
                    elementName = ar[ar.length-1]
                } else {
                    var segmentPath = resource.resourceType;

                    //var rootPath = $filter('dropFirstInPath')(path);
                    path = $filter('dropFirstInPath')(path);
                    insertPoint = resource;
                    var ar = path.split('.');
                    if (ar.length > 0) {
                        for (var i=0; i < ar.length-1; i++) {
                            //not the last one... -
                            var segment = ar[i];
                            segmentPath += '.'+segment;
                            var segmentInfo = this.getEDInfoForPath(segmentPath);
                            if (segmentInfo.isMultiple) {

                                insertPoint[segment] = insertPoint[segment] || []  // todo,need to allow for arrays
                                var node = {};
                                insertPoint[segment].push(node)
                                insertPoint = node
                            } else {
                                insertPoint[segment] = insertPoint[segment] || {}  // todo,need to allow for arrays
                                insertPoint = insertPoint[segment]
                            }
                        }
                        //path = ar[ar.length-1];       //this will be the property on the 'last'segment
                        elementName = ar[ar.length-1];
                    }

                }




                //now actually add the reference. this will be at insertPoint[elementName]

                if (info.max == 1) {
                    insertPoint[elementName] = {reference:referencedResource.resourceType+'/'+referencedResource.id}
                }
                if (info.max =='*') {
                    insertPoint[elementName] = insertPoint[elementName] || []

                    var reference = referencedResource.resourceType+'/'+referencedResource.id;
                    //make sure there isn't already a reference to this resource
                    var alreadyReferenced = false;
                    insertPoint[elementName].forEach(function(ref){
                        if (ref.reference == reference) {
                            alreadyReferenced = true;
                        }
                    })

                    if (! alreadyReferenced) {
                        insertPoint[elementName].push({reference:reference})
                    }

                }
                /*

                if (info.max == 1) {
                    insertPoint[path] = {reference:referencedResource.resourceType+'/'+referencedResource.id}
                }
                if (info.max =='*') {
                    insertPoint[path] = insertPoint[path] || []

                    var reference = referencedResource.resourceType+'/'+referencedResource.id;
                    //make sure there isn't already a reference to this resource
                    var alreadyReferenced = false;
                    insertPoint[path].forEach(function(ref){
                        if (ref.reference == reference) {
                            alreadyReferenced = true;
                        }
                    })

                    if (! alreadyReferenced) {
                        insertPoint[path].push({reference:reference})
                    }

                }
                */

            },
            addSDtoCache : function(profile) {
                gSD[profile.url] = profile;
            },
            getSD : function(resource) {
                //return the SD (profile) for a resource based on it's cannonical url...
                var deferred = $q.defer();
                var that = this;
                //if this resource is a profiled resource, then there will be a meta.profile property. If not, assume a core resource

                var profileUrl = getProfileUrlFromResource(resource); //getProfileUrlCurrentResource();

                if (gSD[profileUrl]) {
                    deferred.resolve(gSD[profileUrl])
                } else {

                    GetDataFromServer.findConformanceResourceByUri(profileUrl).then(
                        function(SD) {

                            //I think it's always safe to call the 'convert to logical model' function...
                            that.makeLogicalModelFromSD(SD).then(
                                function (lm) {
                                    gSD[profileUrl] = lm;
                                    deferred.resolve(lm);
                                }
                            )




                        },function(err){
                            deferred.reject(err)
                        })
                }

                return deferred.promise;
            },
            getSDDEP : function(type) {
                var deferred = $q.defer();

                if (gSD[type]) {
                    deferred.resolve(gSD[type])
                } else {
                    var uri = "http://hl7.org/fhir/StructureDefinition/"+type;
                    GetDataFromServer.findConformanceResourceByUri(uri).then(
                        function(SD) {
                            gSD[type] = SD;
                            deferred.resolve(SD);
                        },function(err){
                            deferred.reject(err)
                        })
                }

                return deferred.promise;
            },
            getEDInfoForPath : function(path) {
                var ar = path.split('.');
                var type = ar[0];       //the resource type is the first segment in the path
                var profileUrl = getProfileUrlCurrentResource();
                var SD = gSD[profileUrl];     //it must have been read at this point...

                if (!SD) {
                    alert("whoops - can't find the profile for this resource - I cannot continue.")
                    return {};
                }

                //var SD = gSD[type];     //it must have been read at this point...
                var info = {path:path};          //this will be the info about this element...

                //find the path
                if (SD.snapshot && SD.snapshot.element) {
                    SD.snapshot.element.forEach(function (ed) {

                        if (ed.path == path) {
                            //is this multiple?
                            info.max = ed.max;
                            info.min = ed.min;
                            info.depth = ar.length;     //the depth of this item in the
                            info.ed = ed;       //never know when you might need it!
                            if (ed.builderMeta && ed.builderMeta.isExtension) {
                                info.isExtension = true;
                                info.extensionType = 'string';      //default to string...
                                if (ed.type) {
                                    info.extensionType = ed.type[0].code;
                                }

                            }
                            if (ed.max == '*') {
                                info.isMultiple = true
                            }

                            //is this a backbone element
                            if (ed.type) {
                                ed.type.forEach(function(typ){
                                    if (typ.code == 'BackboneElement') {
                                        info.isBBE = true
                                    }



                                })
                            }


                        }

                    })

                }
                return info;

            },
            getDetailsByPathForResource : function(resource) {
                //return a hash by path for the given resource indicating multiplicty at that point. Used for creating references...
                //var type = resource.resourceType;
                var deferred = $q.defer();
                var uri = "http://hl7.org/fhir/StructureDefinition/" + resource.resourceType;
                GetDataFromServer.findConformanceResourceByUri(uri).then(
                    function (SD) {
                        //console.log(SD);
                        var hash = {}
                        if (SD && SD.snapshot && SD.snapshot.element) {
                            SD.snapshot.element.forEach(function (ed) {
                                var path = ed.path;
                                var detail = {};        //key details about this path
                                if (ed.max == '*') {
                                    detail.multiple = true;
                                }
                                hash[path]=detail;
                            })
                        }

                    },
                    function (err) {
                        console.log(err);
                        deferred.reject(err)
                    })
                return deferred.promise;
            },
            getSrcTargReferences : function(url) {
                //get all the references to & from the resource
                var vo = {src:[],targ :[]}
                gAllReferences.forEach(function(ref){
                    if (ref.src == url) {
                        vo.src.push(ref)        //this refernece is a from this resource
                    }
                    if (ref.targ == url) {
                        vo.targ.push(ref)       //this refernece is to this resource
                    }
                })
                return vo;
            },
            getReferencesFromResourceDEP : function(resource) {
                var refs = [];
                findReferences(refs,resource,resource.resourceType)
                return refs;

                //find elements of type refernce at this level
                function findReferences(refs,node,nodePath) {
                    angular.forEach(node,function(value,key){
                        //console.log(key,value);
                        //if it's an object, does it have a child called 'reference'?
                        if (angular.isObject(value)) {
                            if (value.reference) {
                                //this is a reference!
                                //console.log('>>>>>>>>'+value.reference)
                                var lpath = nodePath + '.' + key;
                                refs.push({path:lpath,reference : value.reference})
                            } else {
                                //if it's not a reference, then does it have any children?
                                findReferences(refs,value,lpath)
                            }
                        }
                        if (angular.isArray(value)) {
                            value.forEach(function(obj){
                                //examine each element in the array

                                if (obj.reference) {
                                    //this is a reference!
                                    //console.log('>>>>>>>>'+value.reference)
                                    var lpath = nodePath + '.' + key;
                                    refs.push({path:lpath,reference : obj.reference})
                                } else {
                                    //if it's not a reference, then does it have any children?
                                }
                            })


                        }



                    })
                }

            },
            makeGraph : function(bundle,centralResource) {
                //builds the model that has all the models referenced by the indicated SD, recursively...

                var that = this;
                var allReferences = [];
                gAllReferences.length = 0;
/*
                if (centralResource) {
                    var url = centralResource.resourceType + "/" + centralResource.id;
                    var allRefs = that.getSrcTargReferences(url)
                    //create the list of resources references


                    console.log(allRefs);


                }
                */

                var allResources = {};  //all resources hash by id
                var centralResourceNodeId;

                var arNodes = [], arEdges = [];
                var objNodes = {};

                //for each entry in the bundle, find the resource that it references
                bundle.entry.forEach(function(entry){

                    var resource = entry.resource;
                    var addToGraph = true;
                    var url = resource.resourceType+'/'+resource.id;

                    //add an entry to the node list for this resource...
                    var node = {id: arNodes.length +1, label: resource.resourceType, shape: 'box',url:url,cf : {resource:resource}};
                    if (resource.text) {
                        node.title = resource.text.div;
                    }



                    if (centralResource) {
                        if (resource.resourceType == centralResource.resourceType &&  resource.id == centralResource.id) {
                            centralResourceNodeId = node.id
                        }
                    }




                    if (objColours[resource.resourceType]) {
                        node.color = objColours[resource.resourceType];
                    }

                    //if there are implicit rules, then assume a logical model //todo - might want a url for this...
                    if (resource.implicitRules) {
                        node.shape='ellipse';
                        node.color = objColours['LogicalModel'];
                        node.font = {color:'white'}
                    }

                    arNodes.push(node);
                    objNodes[node.url] = node;

                    var refs = [];
                    findReferences(refs,resource,resource.resourceType)

                    refs.forEach(function(ref){
                        allReferences.push({src:node,path:ref.path,targ:ref.reference,index:ref.index})
                        gAllReferences.push({src:url,path:ref.path,targ:ref.reference,index:ref.index});    //all relationsin the collection
                    })

                });


                //so now we have the references, build the graph model...
                allReferences.forEach(function(ref){
                    var targetNode = objNodes[ref.targ];
                    if (targetNode) {
                        var label = $filter('dropFirstInPath')(ref.path);
                        arEdges.push({from: ref.src.id, to: targetNode.id, label: label,arrows : {to:true}})
                    } else {
                        console.log('>>>>>>> error Node Id '+ref.targ + ' is not present')
                    }

                });


                //if there's a centralResource, then only include resources with a reference to or from it...
                if (centralResource) {

                    var centralUrl = centralResource.resourceType + "/" + centralResource.id;
                    var allRefs = that.getSrcTargReferences(centralUrl)

                    var hashNodes = {};

                    //move through the nodes an find the references to & from the central node
                    arNodes.forEach(function (node) {
                        var include = false;
                        var id = node.cf.resource.id;
                        var url = node.cf.resource.resourceType + "/"+node.cf.resource.id;
                        if (id == centralResource.id) {
                            include = true
                        } else {
                            //does the node have a reference to the central one?
                            //iterate though the references where this is the target
                            allRefs.targ.forEach(function(targ){
                                if (targ.src == url) {
                                    //yes, this resource has a reference to the central one...
                                    include = true;
                                }
                            });

                            allRefs.src.forEach(function(src){
                                if (src.targ == url) {
                                    //yes, this resource has a reference to the central one...
                                    include = true;
                                }
                            })

                        }

                        if (! include) {
                            //hide the node
                            node.hidden = true;
                            node.physics=false;
                        } else {
                            hashNodes[url] = true;
                        }


                    })

                    //only show edges where either the source or the target in the central node
                    arEdges.forEach(function (edge) {
                        if (edge.from == centralResourceNodeId || edge.to == centralResourceNodeId) {

                        } else {
                            edge.hidden = true;
                            edge.physics=false;
                        }

                    })

                }





                var nodes = new vis.DataSet(arNodes);
                var edges = new vis.DataSet(arEdges);

                // provide the data in the vis format
                var data = {
                    nodes: nodes,
                    edges: edges
                };

                return {graphData : data, allReferences:allReferences};

                //find elements of type refernce at this level
                function findReferences(refs,node,nodePath,index) {
                    angular.forEach(node,function(value,key){

                        //if it's an object, does it have a child called 'reference'?

                        if (angular.isArray(value)) {
                            value.forEach(function(obj,inx) {
                                //examine each element in the array
                                if (obj) {  //somehow null's are getting into the array...
                                    var lpath = nodePath + '.' + key;
                                    if (obj.reference) {
                                        //this is a reference!

                                        refs.push({path: lpath, reference: obj.reference})
                                    } else {
                                        //if it's not a reference, then does it have any children?
                                        findReferences(refs,obj,lpath,inx)
                                    }
                                }



                            })
                        } else

                        if (angular.isObject(value)) {
                            var   lpath = nodePath + '.' + key;
                            if (value.reference) {
                                //this is a reference!
                                if (showLog) {console.log('>>>>>>>>'+value.reference)}
                                refs.push({path:lpath,reference : value.reference,index:index})
                            } else {
                                //if it's not a reference, then does it have any children?
                                findReferences(refs,value,lpath)
                            }
                        }




                    })
                }


                /*

                 getModelReferences(lst,SD,SD.url);      //recursively find all the references between models...

                 console.log(lst);

                 //build the tree model...




                 lst.forEach(function(reference){

                 var srcNode = getNodeByUrl(reference.src,reference.path,objNodes,arNodes);
                 var targNode = getNodeByUrl(reference.targ,reference.path,objNodes,arNodes);

                 var ar = reference.path.split('.');
                 var label = ar.pop();
                 //ar.splice(0,1);
                 //var label = ar.join('.');
                 arEdges.push({from: srcNode.id, to: targNode.id, label: label,arrows : {to:true}})

                 })


                 var nodes = new vis.DataSet(arNodes);
                 var edges = new vis.DataSet(arEdges);

                 // provide the data in the vis format
                 var data = {
                 nodes: nodes,
                 edges: edges
                 };

                 //construct an object that is indexed by nodeId (for the model selection from the graph
                 var nodeObj = {};
                 arAllModels = []; //construct an array of all the models references by this one
                 arNodes.forEach(function(node){
                 nodeObj[node.id] = node;
                 arAllModels.push({url:node.url})
                 });






                 return {references:lst,graphData:data, nodes : nodeObj,lstNodes : arAllModels};

                 function getNodeByUrl(url,label,nodes) {
                 if (nodes[url]) {
                 return nodes[url];
                 } else {
                 var ar = url.split('/')
                 //var label =
                 var node = {id: arNodes.length +1, label: ar[ar.length-1], shape: 'box',url:url};
                 if (arNodes.length == 0) {
                 //this is the first node
                 node.color = 'green'
                 node.font = {color:'white'}
                 }


                 nodes[url] = node;
                 arNodes.push(node);
                 return node;
                 }
                 }


                 function getModelReferences(lst,SD,srcUrl) {
                 var treeData = that.createTreeArrayFromSD(SD);

                 treeData.forEach(function(item){

                 if (item.data) {
                 //console.log(item.data.referenceUri);
                 if (item.data.referenceUri) {
                 var ref = {src:srcUrl, targ:item.data.referenceUri, path: item.data.path}
                 lst.push(ref);
                 var newSD = that.getModelFromBundle(bundle,item.data.referenceUri);
                 if (newSD) {
                 getModelReferences(lst,newSD,newSD.url)
                 }

                 }
                 }
                 })

                 }

                 */

            },
            getResourcesOfType : function(type,bundle){
                //get all the resources in the bundle of the given type
                var ar = [];
                var baseTypeForModel = appConfigSvc.config().standardExtensionUrl.baseTypeForModel;
                bundle.entry.forEach(function(entry){
                    var resource = entry.resource;
                    //core resource types
                    if (resource.resourceType == type || type == 'Resource') {
                        ar.push(resource);
                    } else {
                        //logical models based on a core resoruce
                        var extensionValue = Utilities.getSingleExtensionValue(resource,baseTypeForModel);
                        if (extensionValue && extensionValue.valueString == type) {
                            ar.push(resource);
                        }
                    }





                })
                return ar;
            },
            getReferences: function (SD) {
                //get all the references for a StructureDefinition

                var references = []
                if (SD && SD.snapshot && SD.snapshot.element) {
                    SD.snapshot.element.forEach(function(ed){
                        if (ed.type) {
                            ed.type.forEach(function(type){
                                if (type.code == 'Reference') {
                                    var profile = type.profile || type.targetProfile;       //stu3 difference...
                                    if (profile) {



                                        //note that profile can be an array or a string
                                        if (angular.isArray(profile)) {
                                            references.push({path:ed.path,profile:profile[0].profile,min:ed.min, max:ed.max})
                                        } else {
                                            references.push({path:ed.path,profile:profile,min:ed.min, max:ed.max})
                                        }
                                    }
                                }
                            })
                        }
                    })
                }
                return references;
            }
        }

    })