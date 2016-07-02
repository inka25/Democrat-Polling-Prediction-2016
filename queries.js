// Some hard-coded data

// number of voters per district
var demVoters = [110548, 190158, 126739, 113984, 175851, 152810, 139133, 96207, 137785, 109391, 176945, 213197, 254996, 174555, 166820, 114496, 127752, 168333, 141411, 157707, 96898, 98773, 91548, 126929, 138765, 147117, 156738, 186843, 149088, 195793, 123096, 149584, 201383, 148353, 121005, 105253, 245199, 174956, 113792, 149079, 111683, 86941, 208887, 196756, 105196, 106250, 158790, 106771, 104027, 89608, 124064, 123977, 153213];

// voter prediction models implemented 
var availModels = [["Gender Model",0,"genderModel"], ["Race/Ethnicity Model",1,"raceModel"], ["Age Model",2,"ageModel"],["Tenure Model", 3, "tenureModel"], ["Combined Model",4,"combinedModel"]];

// required modules - like includes
var sqlite3 = require("sqlite3");
var CensusData = require("./CensusData");
var request = require("request");
var fs = require('fs');
var censusDB = new sqlite3.Database("census.db");
var pollsDB = new sqlite3.Database("polls.db");
        
// the main function that handles the query part of the input
// URL and calls the right function to handle each kind of query
function queryServer(request,response,search) {
    // initial data - the number of voters
    if(search == "?districts=demVoters")
        sendJSONData(demVoters, response);
    // data from the census to display on the map
    else if(search.startsWith("?census="))
        censusServerSearch(search.substring(8, search.length), response);
    // results of a model, to display on the map
    else if(search.startsWith("?model="))
        serveModel(search, response);
    // information on columns in census table
    else if(search == "?censusSchema")
        sendJSONData(CensusData.requiredList, response);
    // list of available models
    else if(search == "?availModels")
        sendJSONData(availModels, response);
    else if(search == "?HuffPo")
        HuffPo(response);
        // request to Huffington Post
}

// this function is used to end all of the query responses
function sendJSONData(data, response) {
    response.writeHead(200, {"Content-Type": "application/json"});
    response.write(JSON.stringify(data));
    response.end();
}

// handling a request for a column of census data
function censusServerSearch(desiredColumn, response) {
    console.log("requesting", desiredColumn, "from census database");
    // censusDB.all contains an SQL request to return a column from 
    // the database, and returns the results as a list of objects to the
    // anonymous callback function 
    censusDB.all("SELECT "+desiredColumn+" FROM Census", 
                function(error, thing){
                    serveFromDatabase(error, thing, desiredColumn, response);
                });
}

// callback function for getting data out of either database table
function serveFromDatabase(error, thing, desiredColumn, response) {
    if(error) console.log(error);
    // the data is a list of objects
    // turn in into a list of just numbers
    var result = [];
    for(var i = 0; i < thing.length; i++) 
	// push adds a new item to the list
        result.push(thing[i][desiredColumn]);
    // send it off! 
    sendJSONData(result,response);
}

// Get each model to the right function
// Each function computes a prediction of the votes in its own way
// The models need to get data out of the databases
function serveModel(search, response){
    var modelType = search.split("=")[1];
    console.log(modelType)

    if(modelType == "genderModel") {
	// Each model computation function has an anonymous callback, 
	// because it has to look something up in the database,
	// which means that it takes a long time to run.
	// This query processing code has to get back and handle
	// more events - this is a Web server, requests are coming 
	// in all the time - so it can't wait around for the model. 
	// Another approach would be to pass the response object to
	// the model computation function, and let it send it off by
	// calling response.end() in it's internal database callback.
	// But these callbacks will come in handy when we want to 
	// compute all of the models and then combine them, below. 
	    computeGenderModel(function(results){sendJSONData(results, response)});        
    } 
    else if(modelType == "ageModel") {
        computeAgeModel(function(results){sendJSONData(results, response)});
    } 
    else if(modelType == "raceModel") {
        computeRaceModel(function(results){sendJSONData(results, response)});
    } 
    else if(modelType == "tenureModel"){
        computeTenureModel(function(results){sendJSONData(results, response)});
    }
    else if(modelType == "combinedModel") {
	// In this case, we use the other technique of just passing 
	// the response object to the function that will fill it out
	// and return it in it's internal database callback. 
        computeCombinedModel(response);
    }
}

// Adjust all the poll data so that undecided votes are assigned
// either to Bernie or Hillary
// Takes a list of rows from the poll data as input
// Returns an object with a member named for each row id,
// containing an object containing the number of votes for either
// Hillary or Bernie
function decideForUndecided(fieldPollRows) {
    var popIndex = {}
    for(var i = 0; i < fieldPollRows.length; i++) {
	// make percents into fractions
        var hill = fieldPollRows[i].hillary/100;
        var bern = fieldPollRows[i].bernie/100;
        var undecided = fieldPollRows[i].undecided/100;
        
	// decide for the undecided
        var result = {};
        result.hillary = undecided*(hill/(hill+bern))+hill;
        result.bernie = 1-result.hillary;
        
        popIndex[fieldPollRows[i].population] = result;
    }
    return popIndex
}

// This function calculates the per district votes using gender
// 
function computeGenderModel(modelReadyCallback){
    var pollingData = [];
    var censusData = [];
    
    // Internal callback function for both database accesses
    // only computes the votes when both poll data and census data are
    // available
    function go() {
        if(pollingData.length == 0 || censusData.length == 0){
            console.log("still waiting on data");
            return;
        }
        
        console.log("ready to go")
        // first decide for the undecided
        var popIndex = decideForUndecided(pollingData);
        // now apply how we think people will vote to each district
        var voteResults = []
        for(var i = 0; i < demVoters.length; i++) {
            var numberOfVoters = demVoters[i]; // for this district
            var numMaleVoters = censusData[i].male * numberOfVoters;
            var numFemaleVoters = censusData[i].female * numberOfVoters;
            
            // how many people will vote for bernie
            var bernieVotes = numMaleVoters*popIndex.Male.bernie; 
            bernieVotes += numFemaleVoters*popIndex.Female.bernie;
            bernieVotes = Math.round(bernieVotes);
            
            var hillaryVotes = numberOfVoters - bernieVotes;
            
            voteResults.push({hVotes:hillaryVotes, bVotes:bernieVotes});
        }

        modelReadyCallback(voteResults);
    } // end of internal callback function 
    

    // database request for poll data
    pollsDB.all("SELECT * FROM Polls WHERE population='Male'\
     OR population='Female'", 
            function(error, thing) {
                if(error) console.log(error);
                
                pollingData = thing;
                go(); // call the common callback function 
            })

    // database request for census data
    censusDB.all("SELECT male, female FROM Census", 
                function(error, thing){
                    if(error) console.log(error);
                
                    censusData = thing;
                    go(); // call the common callback
               })
}

// See comments on gender model!
function computeAgeModel(modelReadyCallback){
    var pollingData = [];
    var censusData = [];
    var keys = ["18-29","30-39","40-49","50-64","65 or older"]
    
    function go() {
        if(pollingData.length == 0 || censusData.length == 0){
            console.log("still waiting on data");
            return;
        }
        
        console.log("ready to go")
        // first decide for the undecided
        var popIndex = decideForUndecided(pollingData);
        
        // now apply how we think people will vote to each district
        var voteResults = []
        for(var i = 0; i < demVoters.length; i++) {
            var numberOfVoters = demVoters[i]; // for this district
            var cenDatum = censusData[i];
            var totalPeople = 0
            for(n in cenDatum) {    // total people in this district
                totalPeople += cenDatum[n]
            }
            
            var r18To29 = (cenDatum.range1519*.4+cenDatum.range2024+cenDatum.range2534*.5)/totalPeople;
            var r30To39 = (cenDatum.range2534*.5+cenDatum.range3544*.5)/totalPeople;
            var r40To49 = (cenDatum.range3544*.5+cenDatum.range4554*.5)/totalPeople;
            var r50To64 = (cenDatum.range4554*.5+cenDatum.range5559+cenDatum.range6064)/totalPeople;
            var r65Plus = (cenDatum.range6574+cenDatum.range7584+cenDatum.range85plus)/totalPeople;
            
            var agePercents = [r18To29,r30To39,r40To49,r50To64,r65Plus]
            var bernieVotes = 0;
            for(var j = 0; j < agePercents.length; j++) {
                var pollDatum = popIndex[keys[j]];
                bernieVotes+=numberOfVoters*agePercents[j]*pollDatum.bernie;
            }
            bernieVotes = Math.round(bernieVotes);
            
            var hillaryVotes = numberOfVoters - bernieVotes;
            
            voteResults.push({hVotes:hillaryVotes, bVotes:bernieVotes});
        }
        
        modelReadyCallback(voteResults);
    }
    
    var columns = "population='"+keys.join("' OR population='")+"'";
    pollsDB.all("SELECT * FROM Polls WHERE "+columns, 
            function(error, thing) {
                if(error) console.log(error);
                
                pollingData = thing;
                go();
            })

    censusDB.all("SELECT range1519,range2024,range2534, range3544,range4554,range5559,range6064,range6574,range7584,range85plus FROM Census", 
                function(error, thing){
                    if(error) console.log(error);
                
                    censusData = thing;
                    go();
               })
}

// See comments on gender model!
function computeRaceModel(modelReadyCallback){
    var pollingData = [];
    var censusData = [];
    var keys = ["White non-Hispanic","Latino","African American","Asian American/other"];
    
    function go() {
        if(pollingData.length == 0 || censusData.length == 0){
            console.log("still waiting on data");
            return;
        }
        
        console.log("ready to go")
        // first decide for the undecided
        var popIndex = decideForUndecided(pollingData);
        
        // now apply how we think people will vote to each district
        var voteResults = []
        for(var i = 0; i < demVoters.length; i++) {
            var numberOfVoters = demVoters[i]; // for this district
            var cenDatum = censusData[i];
            
            var adjWhite = cenDatum.white-.9*cenDatum.hispanic;
            var adjLatino = cenDatum.hispanic;
            var adjBlack = cenDatum.black-.1*cenDatum.hispanic;
            var adjAsian = cenDatum.asian+cenDatum.hawaiian+cenDatum.indian+cenDatum.other+cenDatum.twoPlus;
            
            var racePercents = [adjWhite,adjLatino,adjBlack,adjAsian];
            var bernieVotes = 0;
            for(var j = 0; j < racePercents.length; j++) {
                var pollDatum = popIndex[keys[j]];
                bernieVotes+=numberOfVoters*racePercents[j]*pollDatum.bernie;
            }
            bernieVotes = Math.round(bernieVotes);
            
            var hillaryVotes = numberOfVoters - bernieVotes;
            
            voteResults.push({hVotes:hillaryVotes, bVotes:bernieVotes});
        }
        
        modelReadyCallback(voteResults);
    }
    
    var columns = "population='"+keys.join("' OR population='")+"'";
    pollsDB.all("SELECT * FROM Polls WHERE "+columns, 
            function(error, thing) {
                if(error) console.log(error);
                
                pollingData = thing;
                go();
            })

    censusDB.all("SELECT white,black,indian,asian,hawaiian,other,twoPlus,hispanic FROM Census", 
                function(error, thing){
                    if(error) console.log(error);
                
                    censusData = thing;
                    go();
               })
}
       
function computeTenureModel(modelReadyCallback){
    var pollingData = [];
    var censusData = [];
    
    // Internal callback function for both database accesses
    // only computes the votes when both poll data and census data are
    // available
    function go() {
        if(pollingData.length == 0 || censusData.length == 0){
            console.log("still waiting on data");
            return;
        }
        
        console.log("ready to go")
        // first decide for the undecided
        var popIndex = decideForUndecided(pollingData);
        // now apply how we think people will vote to each district
        var voteResults = []
        for(var i = 0; i < demVoters.length; i++) {
            var numberOfVoters = demVoters[i]; // for this district
            var numOwnerVoters = censusData[i].ownerOccupied * numberOfVoters;
            var numRenterVoters = censusData[i].renterOccupied * numberOfVoters;
            
            // how many people will vote for bernie
            var bernieVotes = numOwnerVoters*popIndex.Homeowner.bernie; 
            bernieVotes += numRenterVoters*popIndex["Renter/other"]["bernie"];
            bernieVotes = Math.round(bernieVotes);
            
            var hillaryVotes = numberOfVoters - bernieVotes;
            
            voteResults.push({hVotes:hillaryVotes, bVotes:bernieVotes});
        }

        modelReadyCallback(voteResults);
    } // end of internal callback function 
    

    // database request for poll data
    pollsDB.all("SELECT * FROM Polls WHERE population='Homeowner' OR population='Renter/other'", 
            function(error, thing) {
                if(error) console.log(error);
                pollingData = thing;
                go(); // call the common callback function 
            })

    // database request for census data
    censusDB.all("SELECT ownerOccupied, renterOccupied FROM Census", 
                function(error, thing){
                    if(error) console.log(error);
                    censusData = thing;
                    go(); // call the common callback
               })
}

// Computes all four models, and then combines them to get
// our best guess for the predicted vote. 
// Feel free to mess around with the proportions of each model, 
// to transfer votes from one candidate to the other because you
// think the results are trend one way or the other, or use other ideas
// to get the predictions that you will hand in.
function computeCombinedModel(response){
    var genderModel = [];
    var ageModel = [];
    var raceModel = [];
    var tenureModel = [];
    
    // Common internal callback will do the combining after all three 
    // models are computed
    function go() {
        if(tenureModel.length == 0 || genderModel.length == 0 || ageModel.length == 0 || raceModel.length == 0){
            console.log("combined waiting");
            return;
        }
        
        console.log("combined Go!")
        var print = "";
	// you could change these (weights are gender, age, race)
        var weights = [.2,.2,.3,.3]
        var voteResults = [];
        for(var i = 0; i < genderModel.length; i++) {
            var bernieVotes = Math.round(tenureModel[i].bVotes*weights[0]+genderModel[i].bVotes*weights[1]+ageModel[i].bVotes*weights[2]+raceModel[i].bVotes*weights[3]);
            var hillaryVotes = Math.round(tenureModel[i].bVotes*weights[0]+genderModel[i].hVotes*weights[1]+ageModel[i].hVotes*weights[2]+raceModel[i].hVotes*weights[3])
            
            voteResults.push({hVotes:hillaryVotes, bVotes:bernieVotes});

            hillaryVotes = Math.round(hillaryVotes / (hillaryVotes + bernieVotes) * 100);
            bernieVotes = 100 - hillaryVotes;
            print += "District "+ (i+1) + " Hillary "+ hillaryVotes +" Bernie "+ bernieVotes + "\n";
        }
        // now we can just stuff these results into the response
	// object and send it off - that's what sendJSONData does
	console.log(print);
	sendJSONData(voteResults,response);

	// print print string to textfile
	fs.writeFile("Inka.Arifin.prediction.txt", print, function(err) {
	    if(err) {
	        return console.log(err);
	    }

	    console.log("The file was saved!");
		}); 
    }
    
    // Begin by computing the three models.  Each one has an 
    // anonymous callback function that calls the "go" callback, 
    // above. The database lookups for the three models will be 
    // done in some order, in parallel. 
    computeGenderModel(function(results){genderModel=results; go();});
    computeAgeModel(function(results){ageModel=results; go();});
    computeRaceModel(function(results){raceModel=results; go();});
    computeTenureModel(function(results){tenureModel=results; go();});
}

function HuffPo(response){

    votes = [];
    function listResponse(body) {
        pollList = JSON.parse(body);
        for (var i = 0; i < 3; i++){

            var questions = pollList[i].questions;
            
            for (var j = 0; j < questions.length ; j++){
                if (questions[j].name == "2016 California Democratic Presidential Primary"){
                    var responses = questions[j].subpopulations[0].responses;
                    var hillary = 0;
                    var bernie = 0;

                    for (var k = 0; k < responses.length; k++){
                        if (responses[k].choice == "Sanders"){
                            bernie = responses[k].value;
                        }
                        else if (responses[k].choice == "Clinton"){
                            hillary = responses[k].value;
                        }
                    }

                    votes.push({"title":pollList[i].pollster, "endDate":pollList[i].end_date, "hillary": hillary, "bernie": bernie});
                }
            }
            
        }

        console.log(votes);
        sendJSONData(votes, response);
    }


    // page=1 means no more than 100 polls
    requestString = "http://elections.huffingtonpost.com/pollster/api/polls.json?page=1&state=CA&after=2016-04-20";

    // This is the request syntax for getting to an API from the server
    // Similar to, but easier than, JSONp, XMLHttpResponse, or a
    // database query.
    request (requestString, function (error, resp, body) { 
        if (!error && resp.statusCode == 200) {
            listResponse(body);
        } else {
            console.log("huffpo says error", error);
        }
    });
}
       
// Make only the queryServer function visible outside this module
exports.queryServer = queryServer;

