var http = require("http");
var request = require("request");

function listResponse(body,response) {
    pollList = JSON.parse(body);

    console.log(pollList);

    questions = pollList[0].questions;

    console.log("questions YAYAYAYA",questions);
    contest = "2016 California Democratic Presidential Primary";
    for (var j=0; j<questions.length; j++) {
    	console.log(questions[j].name);
    	if (questions[j].name == contest) {
    	    subpop = questions[j].subpopulations;
    	    for (var k=0; k<subpop.length; k++) {
    		console.log(subpop[k]);
    	    }
    	}
    }
}


// page=1 means no more than 100 polls
requestString = "http://elections.huffingtonpost.com/pollster/api/polls.json?page=1&state=CA&after=2016-05-01";

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
