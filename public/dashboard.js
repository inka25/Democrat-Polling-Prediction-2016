makeRequest("HuffPo", printInfo);

function printInfo(result){

	result = JSON.parse(result);
	console.log("HuffPo result: ", result);
	var dashboard = document.getElementById("dashboard");
	
	var names = document.getElementById("dashboardNames");
	names.className = "blocksBackground";
	names.id = "dashboardNames";
	names.style.textAlign = "left";
	names.style.display = "inline-block";

	var votesValues = document.getElementById("dashboardValues");
	votesValues.className = "blocksBackground";
	votesValues.id = "dashboardValues";
	votesValues.style.textAlign = "left";
	votesValues.style.display = "inline-block";

	for(var i = 0; i < result.length; i++){
		names.appendChild(document.createTextNode(result[i]["title"]+ " "+result[i]["endDate"]));
		names.appendChild(document.createElement("br"));

		var value = "Hillary: " + result[i]["hillary"] + " Bernie: " + result[i]["bernie"];
		console.log(value);
		votesValues.appendChild(document.createTextNode(value));
		votesValues.appendChild(document.createElement("br"));
	}
	
	dashboard.appendChild(names);
	dashboard.appendChild(votesValues);

}






