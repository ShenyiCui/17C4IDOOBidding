let moment = require('moment')
const https = require('https');
const fs = require('fs');
let telegram = require('node-telegram-bot-api') ;
let token = 'xxx'
let opt = {polling: true}
let bot = new telegram(token, opt)

const schedule = require('node-schedule');
const { GoogleSpreadsheet } = require('google-spreadsheet');

//global static variables
let globalVariables = {
	'biddingDateConfirming': false, //when this is true it means the user is in the middle of confirming his bidding date.
	'joinBidding':false,
	'biddingAdmin': '', // stores the TelegramID of the bidding Admin
	'biddingAdminName':'',//store the name of the bidding Admin
	"biddingDateJSON": '', //stores the current Bidding Date JSON in the format {month: 'Apr', '2021'}
	'AllBidders':[],//JSON Array of all the participating bidders [{name:'Shenyi', id:'TelegramID', signingE: false}]
	'DutyList': [], //JSON Array containing the duty list [{day: 01, id:xxx, name: xxx, points: 1/2/1.5, extra:false}]
	'notAcceptingCmds':false, //when true, bot will not accept commands.
	'omittedDates':[], //Omitted Dates 1 pt
	'bnOffs':[], //Bn Offs 1 pt
	'abnormalDates':[], //abnormal dates 1 pt
	'initiateBidding':false,//true when bidding is being initiated
	'biddingStart': false, //true when bidding for extras and normal bidding start.
	'InitiateCounter':0,//cannot be bigger than 1. User can only initiate twice.
	'biddingExtra': false, //will be true if they're bidding for extras.
}
//wipes all the global variables clean for a clean slate
let cleanSlate = () =>{
	globalVariables.biddingAdmin = '';
	globalVariables.biddingDateConfirming = false;
	globalVariables.biddingDateJSON = '';
	globalVariables.biddingAdminName = '';
	globalVariables.AllBidders = [];
	globalVariables.joinBidding = false;
	globalVariables.notAcceptingCmds = false;
	globalVariables.omittedDates = [];
	globalVariables.bnOffs = [];
	globalVariables.abnormalDates = [];
	globalVariables.biddingStart = false;
	globalVariables.initiateBidding = false;
	globalVariables.InitiateCounter = 0;
	globalVariables.biddingExtra = false;
}

// Initialize the sheet - doc ID is the long id in the sheets URL
const doc = new GoogleSpreadsheet('1KbBhGJsDTqoMnhh6g9efHm0Hz3jJe9R1V7sBYb_IzeE');
const archiveDoc = new GoogleSpreadsheet('1hvLvLDxvxfqUil15ES8oLKVqh3SlQtBvdL_GYOmbEug')
//configures the auth for google sheets
let configureDocAuth = async ()=>{
	// Initialize Auth - see more available options at https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication
	await doc.useServiceAccountAuth({
		client_email: "xxx",
		private_key: "xxx",
	});
}
let configureArchiveDocAuth = async () =>{
	// Initialize Auth - see more available options at https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication
	await archiveDoc.useServiceAccountAuth({
		client_email: "xxx",
		private_key: "xxx",
	});
}
//checks if you're a bidding admin returns true if you are
let checkIfBiddingAdmin = (fromId)=>{
	if(fromId===globalVariables.biddingAdmin){
		return true;
	}
	return false;
}
//sends any message in default italics
let sendMessageI = (chatId, message)=>{
	bot.sendMessage(chatId,
		"<i>"+message+"</i>",
		{parse_mode:'HTML'}
	)
}
//sends any message in default bold
let sendMessageB = (chatId, message)=>{
	bot.sendMessage(chatId,
		"<b>"+message+"</b>",
		{parse_mode:'HTML'}
	)
}
//sends any message
let sendMessage = (chatId, message)=>{
	bot.sendMessage(chatId,
		message,
		{parse_mode:'HTML'}
	)
}
//finds the name by matching telegramID.
let findName = async (chatId) =>{
	let returnName = ''
	await configureDocAuth(); //loading google sheet data
	await doc.loadInfo();// loads document properties and worksheets
	const participatingUsers = doc.sheetsByTitle['Participating Members']
	const rows = await participatingUsers.getRows();
	for(let i =0; i<rows.length;i++){
		let cellVal = rows[i]['Telegram ID']
		if(cellVal.toString().trim()===chatId.toString().trim()){
			returnName = rows[i].Name;
		}
	}
	if(returnName !== ''){
		return returnName;
	}
	return false;
}
//instructions on how to join the bidding.
let joinBiddingInstructions = (chatId)=>{
	sendMessage(chatId,
	"<b>User does not exist in database.\n\n</b>"+
		"<b>To join the bidding visit: </b><a href='https://t.me/DOODutyBot'>DOO Duty Bot</a>\n\n"+
		"<i>Private Message the bot '/start' and follow the instructions.</i>"
	)
}
//No Session Detected
let noSession = (chatId)=>{
	sendMessage(chatId,
		"<b>No Bidding Session Detected / Command Sent Out of Order</b>\n"+
		"<i>To start type: '/start' and follow the instructions.</i>"
	)
}
//not accepting commands
let notAccpCmd = (chatId)=>{
	sendMessage(chatId,
		"<b>Bot Not Currently Accepting Commands</b>\n"+
		"<i>Please wait for the last operation to finish first.</i>"
	)
}
//loading, will not accept commands in the middle of this.
let startLoading = (chatId)=>{
	sendMessageI(chatId,"Loading Data, Please Hold......");
	globalVariables.notAcceptingCmds = true;
}
//end loading, will accept commands now.
let endLoading = (chatId)=>{
	sendMessageI(chatId,"Data Successfully Loaded");
	globalVariables.notAcceptingCmds = false;
}
//accepting command function, will return true if yes, false if not and send a message
let checkCmdAcceptance = (chatId)=>{
	if(globalVariables.notAcceptingCmds){
		notAccpCmd(chatId)
		return false;
	}
	else{
		return true;
	}
}
//Not the bidding admin
let notBiddingAdmin = async (chatId)=>{
	let biddingAdminName = await findName(globalVariables.biddingAdmin)
	sendMessage(chatId,
		"<b>YOU ARE NOT THE BIDDING ADMIN</b>\n"+
		"<i>Only the bidding admin "+biddingAdminName+" can use this command.</i>"
	)
}
//PM Available Commands
let privateAvailableCommands = async (fromId,chatId)=>{
	let name = await findName(fromId)
	sendMessage(chatId,
		"<i>Hello, "+name+"!</i>"+
		"\n\n<b>Available Commands:</b>"+
		"\n<b>1.</b><i>'/SetName XXXX'</i>"+
		"\n<b>2.</b><i>'/MyDuties'</i>"+
		"\n<b>3.</b><i>'/DutyList'</i>"+
		"\n<b>4.</b><i>'/GetCalendar'</i>"+
		"\n<b>5.</b><i>'/AveragePoints'</i>"+
		"\n<b>6.</b><i>'/WGTORDL'</i>"
	)
}
//delete the user from the list because he ORDed
let deleteUser = async(fromId,chatId)=>{
	sendMessageI(chatId,"Deleting user from database......")
	await configureDocAuth(); //loading google sheet data
	await doc.loadInfo();// loads document properties and worksheets
	const participatingUsers = doc.sheetsByTitle['Participating Members']
	const rows = await participatingUsers.getRows();
	let name = await findName(fromId)
	let userExist = false;
	for(let i =0; i<rows.length;i++){
		let cellVal = rows[i]['Telegram ID']
		if(cellVal.toString().trim()===fromId.toString().trim()){
			userExist = true; //if user exists he can be deleted from database
			rows[i].delete();
			bot.sendPhoto(chatId,
			"https://static.straitstimes.com.sg/s3fs-public/styles/article_pictrure_780x520_/public/c6pcsbiv4ae_arx_1.jpg?itok=qOOjwI6K&timestamp=1489653796",
				{caption:"TIGER! Happy ORD, Congratulations "+name+"\n\n<i>User successfully deleted from database.</i>", parse_mode:"HTML"}
			)
		}
	}
	//if users doesn't exist he can't be deleted from database.
	if(userExist === false){
		joinBiddingInstructions(chatId)
	}
}
//gets the month and year of the next bidding, returns a JSON {'month':'Mar', 'year': '2021' } by taking a javascript date object input.
let getNextMonth = (currentDate)=>{
	let biddingYear = '';
	let biddingMonth = '';
	biddingYear = moment(currentDate).add(1, 'M').format('YYYY')
	biddingMonth = moment(currentDate).add(1, 'M').format('MMM')
	return {'month': biddingMonth, 'year':biddingYear}
}
//takes input of year and month in the ## #### format, 03 2021. It'll then return the JSON {'month':'Mar', 'year': '2021' }
let changeMonth = (month, year) =>{
	let dateChosen = moment("01"+month+year, "DDMMYYYY")
	let biddingYear = '';
	let biddingMonth = '';
	biddingYear = moment(dateChosen).format('YYYY')
	biddingMonth = moment(dateChosen).format('MMM')
	return {'month': biddingMonth, 'year':biddingYear}
}
//function that activates when /start is typed in the duty group chat
let startBidding = async(fromId,chatId,biddingDateJSON)=>{
	//biddingDateJSON  a JSON {'month':'Mar', 'year': '2021' }
	cleanSlate(); //wipes the global variables to its preset default values.
	globalVariables.biddingAdmin = fromId;
	globalVariables.biddingDateJSON = biddingDateJSON;
	let adminName = await findName(fromId) //administrator name
	//starter message
	let sendBiddingStartMsg = ()=>{
		sendMessage(chatId,
			"<b>NEW BIDDING INITIATED</b>\n"+
			"<i>Bidding Administrator: "+adminName+"</i>\n"+
			"<b>Detected Bidding Month: </b>" + biddingDateJSON.month + " " + biddingDateJSON.year+"\n\n"+
			"<i>If this is correct type: </i>\n'/ConfirmBidDate'\n"+
			"<i>If this is incorrect type: </i>\n'/ChangeBidDate MM YYYY'"
		)
		globalVariables.biddingDateConfirming = true;
	}
	if(adminName){sendBiddingStartMsg();}//if name exists in database
	else{joinBiddingInstructions(chatId);}//if name doesn't exist in database
	//console.log(getNextMonth(new Date()))
	//console.log(changeMonth("06", "2021"))
}
//function to initiate the user into the google sheets.
let initiateUser = async (fromId)=>{
	sendMessage(fromId, // welcome message
		"<b>Hello, welcome to 17C4I BN's Duty Bidding!</b>\n\n"+
		"<i>Created By Cui Shen Yi\nContact 88705204 for maintenance</i>"
		)
	startLoading(fromId);
	await configureDocAuth(); //loading google sheet data
	await doc.loadInfo();// loads document properties and worksheets
	const participatingUsers = doc.sheetsByTitle['Participating Members']
	const rows = await participatingUsers.getRows();
	let userExists = false; //if the user doesn't exist in the sheet this'll be false;
	for(let i =0; i<rows.length;i++){
		let cellVal = rows[i]['Telegram ID']
		if(cellVal.toString().trim()===fromId.toString().trim()){
			userExists = true;
		}
	}
	endLoading(fromId)
	if(userExists === false){ //if user has not been initiated before
		sendMessage(fromId,
			"<i>You've been detected as a new user.</i>"+
			"\n\n<b>To continue please enter your name</b>\nThis is the name that'll be displayed to your peers."+
			"\n\n<i>Type: '/SetName XXXX'</i>"
		)
	}
	//if user already exists in the database.
	else{
		await privateAvailableCommands(fromId, fromId)
	}
}
//confirms the name the user enters and either edits or adds the new user into the database.
let confirmName = async (fromId, chosenName)=>{
	await configureDocAuth();
	await doc.loadInfo(); // loads document properties and worksheets
	const participatingUsers = doc.sheetsByTitle['Participating Members'];
	const rows = await participatingUsers.getRows();
	let userExists = false; //if the user doesn't exist in the sheet this'll be false;
	for(let i =0; i<rows.length;i++){
		let cellVal = rows[i]['Telegram ID']
		if(cellVal.toString().trim()===fromId.toString().trim()){
			userExists = true;
			rows[i].Name = chosenName;
			rows[i].save();
			privateAvailableCommands(fromId, fromId)
			sendMessageI(fromId, "New Name Successfully Saved! Thank you, please await the next bidding in the group chat.")
		}
	}
	if(userExists === false){
		await participatingUsers.addRow({ 'Telegram ID': fromId, 'Name': chosenName});
		privateAvailableCommands(fromId, fromId)
		sendMessageI(fromId, "User Successfully Added! Thank you, please await the next bidding in the group chat.")
	}
}
//Gets the Month and Year from a Google Sheets Object in the {'month':'Mar', 'year': '2021' } format
let getMonthYearFromSheet = async (sheetName, Document) =>{
	await Document.useServiceAccountAuth({
		client_email: "xxx",
		private_key: "xxx",
	});
	await Document.loadInfo();
	const sheetObj = await Document.sheetsByTitle[sheetName]
	const rows = await sheetObj.getRows();
	if(rows[0] !== undefined){return {month:rows[0]['Month'], year: rows[0]['Year']}}
	else{return {month:'', year:''}}
}
let addMonthYearToSheet = async (sheetName, Document, DateJSON) =>{
	await Document.useServiceAccountAuth({
		client_email: "xxx",
		private_key: "xxx",
	});
	await Document.loadInfo();
	const sheetObj = await Document.sheetsByTitle[sheetName]
	const rows = await sheetObj.getRows();
	let newMonth = DateJSON.month;
	let newYear = DateJSON.year;
	if(rows[0]!==undefined){
		rows[0]['Month'] = newMonth;
		rows[0]['Year'] = newYear;
		rows[0]['Points'] = "=sumifs(C:C,B:B,J2)"
		await rows[0].save();
	}
	else{
		await sheetObj.addRow({Month: newMonth, Year: newYear});
	}
}
//sends out the chain message whenever someone joins the bid. zzAllBidders is from Global Static Variables, check above for structure.
//[{name:'Shenyi', id:'TelegramID', signingE: false}]
let sendJoinBiddingInstructions = async (chatId,fromId,zzAllBidders)=>{
	let participatingNames = []; //array containing all the names of those participating
	let extraNames = [];//array containing all the names signing extras.
	let participatingNameString = "";
	let extraNameString = "";
	let totalPoints = calculateTotalPoints(globalVariables.DutyList);

	for(let i =0; i<zzAllBidders.length; i++){
		participatingNames.push(zzAllBidders[i].name)
		if(zzAllBidders[i].signingE){
			extraNames.push(zzAllBidders[i].name)
		}
	}
	for(let i =0; i<participatingNames.length; i++){
		participatingNameString = participatingNameString + participatingNames[i] +"\n"
	}
	for(let i=0; i<extraNames.length; i++){
		extraNameString = extraNameString + extraNames[i] +"\n"
	}

	sendMessage(chatId,
		"<b>Below are the instructions for Bidding Admin: </b><i>"+globalVariables.biddingAdminName+"</i>\n"+
		"Please Check Your Private Message to edit this Month's Settings. Edit the sheet accordingly.\n\n"+
		"<b>All those Signing Extras please type: </b>\n'/SigningE'\n"+
		"<b>All those on Normal Duty please type: </b>\n'/MeowMeow'\n"+
		"<b>Once ready, Admin, please type: </b>\n'/Initiate'\n\n"+
		"<b>Participating Members ("+participatingNames.length+"):</b>\n"+ participatingNameString + '\n'+
		"<b>Signing Extras ("+extraNames.length+"):</b>\n" + extraNameString + '\n\n'+
		"<b>Estimated Point Calc:</b>\n"+
		"<i>Total Points: </i>"+totalPoints+'\n'+
		"<i>Avg Points Per Person: </i>"+ (Math.round(((totalPoints/participatingNames.length) + Number.EPSILON) * 100) / 100)
	)
}
//Confirms the Bidding Date, moves old month into an archive, prompts users that are signing extras to sound off
let confirmDate = async (chatId, fromId)=>{
	startLoading(chatId);

	await configureDocAuth(); //configuring Authentication for For the Main Document 17C4I DOO Bidding
	await configureArchiveDocAuth(); //configuring Authentication for For the archive Document DOO DUTY ARCHIVE

	globalVariables.biddingAdminName = await findName(fromId)

	const currentSettings = doc.sheetsByTitle["Current Settings"]; //gets the current settings sheet information. this page will be renamed and archived to DOO DUTY ARCHIVE
	const goldenCopy = doc.sheetsByTitle["GOLDEN COPY"] //gets the golden copy sheet information. This sheet will be copied and replace current settings

	//copies current settings to DOO Duty Archive.
	await currentSettings.copyToSpreadsheet("1hvLvLDxvxfqUil15ES8oLKVqh3SlQtBvdL_GYOmbEug")
	//copies the golden copy to replace Current Settings in the main 17C4I DOO Bidding Page
	await goldenCopy.copyToSpreadsheet("1KbBhGJsDTqoMnhh6g9efHm0Hz3jJe9R1V7sBYb_IzeE")

	//Deletes Current Settings after it's been transferred to the archive.
	await currentSettings.delete()
	//gets the copied sheet by name.
	const copyOfGoldenCopy = doc.sheetsByTitle["Copy of GOLDEN COPY"]
	//renames it to Current Settings to be Populated.
	await copyOfGoldenCopy.updateProperties({title:"Current Settings"})
	//needs to rename the archived sheet into the month and year so it'll now retrieve the month and year from the data in the google sheets.
	let newNameJSON = await getMonthYearFromSheet("Copy of Current Settings", archiveDoc)
	let newName = newNameJSON.month + " " + newNameJSON.year
	const copyOfCurrentSettings = archiveDoc.sheetsByTitle["Copy of Current Settings"]
	//renaming from the data in the google sheets. This if statement is validation. If no date data is provided the sheet will be deleted and not archived.
	if(newName.length === 8){await copyOfCurrentSettings.updateProperties({title:newName})}
	else{copyOfCurrentSettings.delete()}

	//adding this month's bidding date (month and year) to the current settings sheet in the main 17C4I DOO Bidding Page
	await addMonthYearToSheet("Current Settings", doc, globalVariables.biddingDateJSON);
	globalVariables.DutyList = await generateDutyDaysList();
	endLoading(chatId);

	globalVariables.joinBidding = true;
	await sendJoinBiddingInstructions(chatId, fromId, [])
	sendMessage(fromId, "<b>Hello Admin, </b>Please visit the <a href='https://docs.google.com/spreadsheets/d/1KbBhGJsDTqoMnhh6g9efHm0Hz3jJe9R1V7sBYb_IzeE/edit#gid=583640742'>Link</a> and read the instructions.")
}
//function will take a day of the week e.g "Monday" and return an array [xx,xx,xx] containing all the days where a monday will occur
let getAllx = async (dayOfWeek)=>{
	let tempArray = [];
	let currentDate = globalVariables.biddingDateJSON
	let day = moment(currentDate.month + currentDate.year,"MMMYYYY")
		.startOf('month')
		.day(dayOfWeek);
	if (day.date() > 7) day.add(7,'d');
	let month = day.month();
	while(month === day.month()){
		tempArray.push(day.format("DD"))
		day.add(7,'d');
	}
	return tempArray
}
//generates an array containing the full column information of a particular header in google sheets
let getColumnInfo = async (sheetName, Document, headerValue)=>{
	await Document.useServiceAccountAuth({
		client_email: "xxx",
		private_key: "xxx",
	});
	await Document.loadInfo();
	const sheetObj = await Document.sheetsByTitle[sheetName]
	const rows = await sheetObj.getRows();
	let counter = 0;
	let values = [];

	let continueNow = true;
	while(continueNow){
		if(rows[counter]!==undefined){
			if(rows[counter][headerValue] !== ""){
				values.push(rows[counter][headerValue])
				//console.log("Value: " + rows[counter][headerValue])
			}
			counter += 1;
		}
		else{
			continueNow = false;
		}
	}
	return values;
}
//get Omitted Dates, Bn Offs and Abnormal Dates
let getUserSettings = async () =>{
	await configureDocAuth()
	const sheetObj = await doc.sheetsByTitle['Current Settings']
	const rows = await sheetObj.getRows();

	globalVariables.abnormalDates = [];
	globalVariables.bnOffs = [];
	globalVariables.omittedDates = [];

	let counter = 0;
	let continueNow = true;
	while(continueNow){
		if(rows[counter]!==undefined){
			if(rows[counter]['Omitted Dates'] !== ""){
				globalVariables.omittedDates.push(rows[counter]['Omitted Dates'])
				//console.log("Value: " + rows[counter][headerValue])
			}
			else{
				continueNow = false;
			}
			counter += 1;
		}
		else{
			continueNow = false;
		}
	}
	continueNow = true;
	counter = 0;
	while(continueNow){
		if(rows[counter]!==undefined){
			if(rows[counter]['Battalion Offs (2 Pts)'] !== ""){
				globalVariables.bnOffs.push(rows[counter]['Battalion Offs (2 Pts)'])
				//console.log("Value: " + rows[counter][headerValue])
			}
			else{
				continueNow = false;
			}
			counter += 1;
		}
		else{
			continueNow = false;
		}
	}
	continueNow = true;
	counter = 0;
	while(continueNow){
		if(rows[counter]!==undefined){
			if(rows[counter]['Abnormal Dates (1 Pts)'] !== ""){
				globalVariables.abnormalDates.push(rows[counter]['Abnormal Dates (1 Pts)'])
				//console.log("Value: " + rows[counter][headerValue])
			}
			else{
				continueNow = false;
			}
			counter += 1;
		}
		else{
			continueNow = false;
		}
	}
}
//turns an array of numbers into 2 digits
let turnInto2Digits = (arr) =>{
	for(let i=0; i<arr.length; i++){
		if(arr[i].length !== 2 && arr[i].length === 1){
			arr[i] = '0' + arr[i].toString();
		}
	}
	return arr;
}
//turn a normal string into 2 digits
let turnInto2DigitsNonArr = (num) =>{
	let digit2 = num;
	if(num.length !== 2 && num.length === 1){
		digit2 = '0' + num.toString();
	}
	return digit2
}
//Bubble sort JSON array
//bubble sort algorithm, used throughout to sort JSON Arrays, sort value is the value inside the json object that will be sorted, secondary sort value will be the second data to be sorted iF the first sort array is equal.
let bubble_SortJSONArray = (a,sortValue)=>{
	var swapp;
	var n = a.length-1;
	var x=a;
	do {
		swapp = false;
		for (var i=0; i < n; i++)
		{
			if (x[i][sortValue] > x[i+1][sortValue])
			{
				var temp = x[i];
				x[i] = x[i+1];
				x[i+1] = temp;
				swapp = true;
			}
		}
		n--;
	} while (swapp);
	return x;
}
//Generates the Duty list [{day: 1, id:xxx, name: xxx, points: 1/2/1.5/0, extra: false}]
let generateDutyDaysList = async ()=>{
	let allMondays = await getAllx('Monday')
	let allTuesdays = await getAllx('Tuesday')
	let allWednesdays = await getAllx('Wednesday')
	let allThursdays = await getAllx('Thursday')
	let allFriday = await getAllx('Friday')
	let allSaturday = await getAllx('Saturday')
	let allSunday = await getAllx('Sunday')

	let allDatesJSON = {
		Mondays: allMondays,
		Tuesdays: allTuesdays,
		Wednesdays: allWednesdays,
		Thursdays: allThursdays,
		Fridays: allFriday,
		Saturdays: allSaturday,
		Sundays: allSunday
	}

	//console.log(allDatesJSON)

	let DutyDaysList = []
	await getUserSettings();

	globalVariables.omittedDates = turnInto2Digits(globalVariables.omittedDates);
	globalVariables.bnOffs = turnInto2Digits(globalVariables.bnOffs);
	globalVariables.abnormalDates = turnInto2Digits(globalVariables.abnormalDates);

	let omittedDates = globalVariables.omittedDates;
	let bnOffs = globalVariables.bnOffs;
	let abnormalDates = globalVariables.abnormalDates;

	let j = 0
	for(let x in allDatesJSON){
		let val = await allDatesJSON[x]
		//console.log(val)
		for(let i =0; i<omittedDates.length; i++){
			if(val.includes(omittedDates[i])){
				const index = val.indexOf(omittedDates[i]);
				if (index > -1) {
					val.splice(index, 1);
				}
			}
		}
		//[{day: 01, id:xxx, name: xxx, points: 1/2/1.5, extra: false}]
		for(let i =0; i<val.length; i++){
			let points = 0;

			if(j >= 0 && j <=3){points = 1;}
			else if(j==4){points = 1.5;}
			else{points = 2;}

			if(bnOffs.includes(val[i])){points = 2;}
			else if(abnormalDates.includes(val[i])){points = 1;}

			let tempJSON = {'day': val[i], 'points':points, 'id':'', 'name':'', 'extra': false}
			DutyDaysList.push(tempJSON)
		}
		j += 1;
	}
	DutyDaysList = bubble_SortJSONArray(DutyDaysList, 'day')
	for(let i =0; i<DutyDaysList.length; i++){
		if(DutyDaysList[i].points === 2 && i !== 0){
			if( (DutyDaysList[i-1].points !== 1.5 && DutyDaysList[i-1].points !== 2) && (parseInt(DutyDaysList[i].day) - parseInt(DutyDaysList[i-1].day) === 1) ){
				DutyDaysList[i-1].points = 1.5;
			}
		}
	}
	//console.log(DutyDaysList)
	return DutyDaysList;
}
//adds a date claimed into the duty list
let addToDutyList = (fromId,chatId, dayNum, extra) =>{
	let name = "";
	let extraMember = false;
	let changesMade = false;
	for(let i=0; i<globalVariables.AllBidders.length; i++){
		if(globalVariables.AllBidders[i].id === fromId){
			name = globalVariables.AllBidders[i].name
			extraMember = globalVariables.AllBidders[i].signingE
		}
	}
	//console.log(name)
	//console.log(extraMember)
	if(extra){
		if(extra && extraMember){
			for(let i =0; i<globalVariables.DutyList.length; i++){
				if(globalVariables.DutyList[i].id ===''){
					if(globalVariables.DutyList[i].day === dayNum){
						globalVariables.DutyList[i].id = fromId;
						globalVariables.DutyList[i].name = name;
						globalVariables.DutyList[i].extra = extra;
						changesMade = true;
					}
				}
			}
		}
	}
	else{
		for(let i =0; i<globalVariables.DutyList.length; i++){
			if(globalVariables.DutyList[i].id ==='') {
				if (globalVariables.DutyList[i].day === dayNum) {
					globalVariables.DutyList[i].id = fromId;
					globalVariables.DutyList[i].name = name;
					changesMade = true;
				}
			}
		}
	}
	if(changesMade){sendBiddingInfo(chatId,fromId,globalVariables.DutyList,extra)}
}
//removes a date claimed into the duty list
let removeFromDutyList = (fromId, chatId, dayNum, extra)=>{
	let changesMade = false;
	for(let i =0; i<globalVariables.DutyList.length; i++){
		if(globalVariables.DutyList[i].day === dayNum && globalVariables.DutyList[i].id === fromId){
			globalVariables.DutyList[i].id = ''
			globalVariables.DutyList[i].name = '';
			globalVariables.DutyList[i].extra = false;
			changesMade = true
		}
	}
	if(changesMade){sendBiddingInfo(chatId,fromId,globalVariables.DutyList,extra)}

}
//calculates the monthly total points
let calculateTotalPoints = (dutyList) => {
	let totalPoints = 0;
	for(let i =0; i<dutyList.length; i++){
		totalPoints = totalPoints + parseFloat(dutyList[i].points);
	}
	return totalPoints;
}
//Lets the FromID join the bidding, adds them to the list to calculate total points.
let joinBidding = async (chatId, fromId, signE)=>{
	startLoading(chatId);
	let name = await findName(fromId)
	if(name){
		let nameExists = false;
		let changeFromB4 = false;
		let indexOfChangedUser = -1;
		for(let i = 0; i<globalVariables.AllBidders.length; i++){
			if(globalVariables.AllBidders[i].name === name){
				nameExists = true;
				if(globalVariables.AllBidders[i].signingE !== signE){
					changeFromB4 = true;
					indexOfChangedUser = i;
				}
			}
		}
		if(!nameExists){ //true
			globalVariables.AllBidders.push({name:name, id:fromId, signingE: signE});
			await configureDocAuth();
			const sheet = doc.sheetsByTitle['Current Settings'];

			let extraCounter = 0;
			for(let i = 0; i<globalVariables.AllBidders.length; i++){
				if(globalVariables.AllBidders[i].signingE){
					extraCounter += 1;
				}
			}

			const rows = await sheet.getRows(); // can pass in { limit, offset }
			rows[globalVariables.AllBidders.length - 1].Name = name;
			rows[globalVariables.AllBidders.length - 1]["Points"] = "=sumifs(C:C,B:B,J"+((globalVariables.AllBidders.length - 1)+2).toString()+")"
			await rows[globalVariables.AllBidders.length - 1].save(); // save updates
			if(signE){
				rows[extraCounter-1]["Signing Extras"] = name;
				rows[extraCounter-1]["Points"] = "=sumifs(C:C,B:B,J"+((extraCounter-1)+2).toString()+")"
				await rows[extraCounter-1].save(); // save updates
			}
			endLoading(chatId);
			window.setTimeout(async ()=>{await sendJoinBiddingInstructions(chatId,fromId,globalVariables.AllBidders)}, 500);
		}
		else if(changeFromB4){
			endLoading(chatId);
			window.setTimeout(()=>{sendMessageI(chatId, "You cannot change From Signing Extras to Not Signing & Vice Versa. To change you must restart the bid.\n\nIf you want to restart the bid, the bidding admin MUST delete the orange cells in the 'Current Settings' tab of the google sheet before typing: '/start'")},500)
		}
		else{
			endLoading(chatId);
			window.setTimeout(()=>{sendMessageI(chatId, "User already in the bid")},500)
		}
	}
	else{
		endLoading(chatId);
		joinBiddingInstructions(chatId);
	}

};
//confirm initiateBidding
let confirmBiddingInformation = async (chatId, fromId) =>{
	startLoading(chatId);
	let participatingNames = [];
	let extraNames = [];
	let participatingNameString = '';
	let extraNameString = '';
	for(let i =0; i<globalVariables.AllBidders.length; i++){
		participatingNames.push(globalVariables.AllBidders[i].name)
		if(globalVariables.AllBidders[i].signingE){
			extraNames.push(globalVariables.AllBidders[i].name)
		}
	}
	for(let i =0; i<participatingNames.length; i++){
		participatingNameString = participatingNameString + participatingNames[i] +"\n"
	}
	for(let i=0; i<extraNames.length; i++){
		extraNameString = extraNameString + extraNames[i] +"\n"
	}
	globalVariables.DutyList = await generateDutyDaysList();
	let totalPoints = calculateTotalPoints(globalVariables.DutyList)
	let averagePoints = (Math.round(((totalPoints/participatingNames.length) + Number.EPSILON) * 100) / 100)

	endLoading(chatId)
	setTimeout(()=>{
		sendMessage(chatId,
			"<b>Bidding Admin: </b><i>"+globalVariables.biddingAdminName+"</i>\n"+
			"Please Check to see if your settings are correct for this month's bid\n\n"+
			"<b>You can only re-initiate the bid once\nTries left: </b>"+(2-globalVariables.InitiateCounter)+"\n\n"+
			"<b>If they're correct please type: </b>'/Ready'\n"+
			"<b>If they're incorrect please edit and type: </b>'/Initiate'\n\n"+
			"<b>Participating Members ("+participatingNames.length+"):</b>\n"+ participatingNameString + '\n'+
			"<b>Signing Extras ("+extraNames.length+"):</b>\n" + extraNameString + '\n\n'+
			"<b>Estimated Point Calc:</b>\n"+
			"<i>Omitted Dates: </i>\n" + globalVariables.omittedDates + '\n'+
			"<i>Bn Offs (2 Pts): </i>\n" + globalVariables.bnOffs + '\n'+
			"<i>Abnormal Dates (1 Pts): </i>\n"+globalVariables.abnormalDates+'\n\n'+
			"<i>Total Points: </i>"+totalPoints+'\n'+
			"<i>Avg Points Per Person: </i>"+ averagePoints
		)
	},500)
}
//starts bidding process. sends the message. Needs to initiate a countdown first
let startBiddingProcess = async (chatId, fromId)=>{
	let signingExtra = false;
	globalVariables.biddingExtra = false;
	for(let i =0; i<globalVariables.AllBidders.length; i++){
		if(globalVariables.AllBidders[i].signingE){
			signingExtra = true;
			globalVariables.biddingExtra = true;
		}
	}
	let startingInfo = "ALL BIDDERS GET READY!"
	if(signingExtra){startingInfo = "ALL SIGNING EXTRAS GET READY!"}
	let counter = 3
	sendMessage(chatId, startingInfo)
	setTimeout(()=>{
		countDown()
	},2000)
	function countDown(){
		sendMessage(chatId, counter)
		counter -= 1
		if(counter === -1){
			setTimeout(()=>{
				globalVariables.biddingStart = true;
				sendBiddingInfo(chatId, fromId, globalVariables.DutyList, signingExtra);
			},1000)
		}
		else{
			setTimeout( ()=>{countDown()}, 1000)
		}

	}
}
//returns personal data from duty list. [{name: xxx, id:xxx, dates:['|Wed 03 [E]|','|Thu 04|'], points: 4}]
let getPersonalData = (dutyList) => {
	let personalData = []
	//console.log(dutyList)
	for(let i = 0; i<globalVariables.AllBidders.length; i++){
		let tempJSON = {name:globalVariables.AllBidders[i].name, id:globalVariables.AllBidders[i].id, dates:[], points:0}
		for(let j = 0; j<dutyList.length; j++){
			//[{day: 01, id:xxx, name: xxx, points: 1/2/1.5, extra:false}]
			if(dutyList[j].id === globalVariables.AllBidders[i].id){
				let dayOfWeek = moment(dutyList[j].day + globalVariables.biddingDateJSON.month + globalVariables.biddingDateJSON.year, "DDMMMYYYY").format("ddd")
				let dateString = ""
				let points = 0;
				if(dutyList[j].extra){
					dateString = "|"+dayOfWeek+" "+dutyList[j].day+" [E]|"
				}
				else{
					dateString = "|"+dayOfWeek+" "+dutyList[j].day+"|"
					points = parseFloat(dutyList[j].points)
				}
				tempJSON.dates.push(dateString)
				tempJSON.points = parseFloat(tempJSON.points) + parseFloat(points);
			}
		}
		personalData.push(tempJSON);
	}
	return personalData;
}
//send bidding information
let sendBiddingInfo = (chatId, fromId, dutyList, signingE) => {
	let signingEInfo = ''
	if(signingE){
		signingEInfo = "<b>BIDDING FOR EXTRAS</b>\n<i>Once finished: '/Continue'</i>\n\n"
	}
	let personalData = getPersonalData(dutyList) //JSON array containing the days each member has bid
	//[{name: xxx, id:xxx, dates:['|Wed 03 [E]|','|Thu 04|'], points: 4}]
	//console.log(dutyList)
	let allDays = [[],[],[],[],[],[],[]] // contains the 7 arrays that will be used to store available days.
	for(let i =0; i<dutyList.length; i++){
		let dayOfWeek = moment(dutyList[i].day + globalVariables.biddingDateJSON.month + globalVariables.biddingDateJSON.year, "DDMMMYYYY").format('ddd')
		//console.log(dayOfWeek)
		switch (dayOfWeek){
			case 'Mon':
				allDays[0].push(dutyList[i].day)
				break;
			case 'Tue':
				allDays[1].push(dutyList[i].day)
				break;
			case 'Wed':
				allDays[2].push(dutyList[i].day)
				break;
			case 'Thu':
				allDays[3].push(dutyList[i].day)
				break;
			case 'Fri':
				allDays[4].push(dutyList[i].day)
				break;
			case 'Sat':
				allDays[5].push(dutyList[i].day)
				break;
			case 'Sun':
				allDays[6].push(dutyList[i].day)
				break;
		}
	}
	for(let i = allDays.length-1; i>-1; i--){
		for(let j =allDays[i].length-1; j>-1; j--){
			for(let k =dutyList.length-1; k>-1; k--){
				if(allDays[i][j] === dutyList[k].day && dutyList[k].name !== ''){
					const index = allDays[i].indexOf(dutyList[k].day);
					if (index > -1) {
						allDays[i].splice(index, 1);
					}
				}
			}
		}
	}

	let availableDates = '<b>AVAILABLE DATES: '+globalVariables.biddingDateJSON.month + ' '+globalVariables.biddingDateJSON.year+'</b>\n'
	availableDates += "<b>Mon: </b>" + allDays[0] + "\n"
	availableDates += "<b>Tue: </b>" + allDays[1] + "\n"
	availableDates += "<b>Wed: </b>" + allDays[2] + "\n"
	availableDates += "<b>Thu: </b>" + allDays[3] + "\n"
	availableDates += "<b>Fri: </b>" + allDays[4] + "\n"
	availableDates += "<b>Sat: </b>" + allDays[5] + "\n"
	availableDates += "<b>Sun: </b>" + allDays[6] + "\n\n"

	let personalDataString = ''
	for(let i = 0; i<personalData.length; i++){
		personalDataString += personalData[i].name + ": " + personalData[i]['dates']+ "\nPoints: "+personalData[i].points+"\n\n"
	}

	let instructions = "<b>To Claim a Date Type: </b>\n'/accio ##'\n"+
		"<b>To Return a Date Type: </b>\n'/reducto ##'\n"+
		"<i>Where ## denotes a 2 digit date number</i>\n\n"+
		"<b>When the bidding is over type: </b>\n'/end'"

	sendMessage(chatId, signingEInfo + availableDates + personalDataString + instructions)
}
//send endbid message
let endBidMessage = async (dutyList, chatId) =>{
	let CAA = moment(new Date()).format("HHmm DDMMYYYY")
	let beginningText = "<b>Duties for "+globalVariables.biddingDateJSON.month+" "+globalVariables.biddingDateJSON.year+"</b>\nCAA "+CAA+"\n\n"
	let personalData = getPersonalData(dutyList)
	let personalDataString = ''
	for(let i = 0; i<personalData.length; i++){
		personalDataString += personalData[i].name + ": " + personalData[i]['dates']+ "\nPoints: "+personalData[i].points+"\n\n"
	}
	let dateStrings = ''
	for(let i =0; i<dutyList.length; i++){
		let dayOfWeek = moment(dutyList[i].day + globalVariables.biddingDateJSON.month + globalVariables.biddingDateJSON.year, "DDMMMYYYY").format("ddd")
		if(dutyList[i].extra){
			dateStrings += dayOfWeek + " " + dutyList[i].day + " - " + dutyList[i].name + " [E]\n"
		}
		else{
			dateStrings += dayOfWeek + " " +dutyList[i].day + " - " + dutyList[i].name + "\n"
		}
	}
	sendMessage(chatId, beginningText + personalDataString + dateStrings)
}
//end the bid
let endBid = async (dutyList, chatId, fromId) => {
	endBidMessage(dutyList, chatId)
	await configureDocAuth()
	const sheetObj = await doc.sheetsByTitle["Current Settings"]
	const rows = await sheetObj.getRows();
	//[{day: 01, id:xxx, name: xxx, points: 1/2/1.5, extra:false}]
	let newRows = [];
	for(let i =0; i<dutyList.length; i++){
		if(rows[i]!==undefined){
			rows[i]["Day"] = dutyList[i].day;
			rows[i]["DOO"] = dutyList[i].name;
			rows[i]["Points"] = "=sumifs(C:C,B:B,J"+(i+2).toString()+")"
			if(dutyList[i].extra){rows[i]["Pts"] = 0;}
			else{rows[i]["Pts"] = dutyList[i].points;}
			await rows[i].save();
		}
		else{
			let tempJSON;
			if(dutyList[i].extra){tempJSON = {'Day':dutyList[i].day, 'DOO': dutyList[i].name, 'Pts':0}}
			else{tempJSON = {'Day':dutyList[i].day, 'DOO': dutyList[i].name, 'Pts':dutyList[i].points}}
			newRows.push(tempJSON)
		}
	}
	await sheetObj.addRows(newRows);
}
//generates the duty list and all bidders from CurrentSettings
let dutyListCurrent = async (chatId, fromId) =>{
	startLoading(chatId);
	await configureDocAuth(); //configuring Authentication for For the Main Document 17C4I DOO Bidding
	await doc.loadInfo()
	const sheetObj = await doc.sheetsByTitle["Current Settings"]
	const allMembers = await doc.sheetsByTitle["Participating Members"]
	const rows = await sheetObj.getRows();
	const memberRows = await allMembers.getRows();
	//Duty List structure[{day: 01, id:xxx, name: xxx, points: 1/2/1.5, extra:false}]
	//JSON Array of all the participating bidders [{name:'Shenyi', id:'TelegramID', signingE: false}]
	let continueLoop = true;
	let continueLoop2 = true;
	let i = 0;
	let j =0;
	let allBiddersArray = [];
	while(continueLoop){
		let tempJSON = {name:"", id:"", signingE: false}
		if(rows[i] !== undefined){
			if(rows[i]['Name'] !== undefined) {
				if (rows[i]['Name'].trim().length !== 0) {
					tempJSON.name = rows[i]['Name'];
					j = 0;
					continueLoop2 = true;
					while (continueLoop2) {
						if (memberRows[j] !== undefined) {
							if (rows[i]['Name'] === memberRows[j]['Name']) {
								tempJSON.id = memberRows[j]['Telegram ID']
							}
						} else {
							continueLoop2 = false;
						}
						j += 1;
					}
					j = 0;
					continueLoop2 = true;
					while (continueLoop2) {
						if (rows[j] !== undefined) {
							if (rows[j]['Signing Extras'] !== '') {
								if (rows[j]['Signing Extras'] === rows[i]['Name']) {
									tempJSON.signingE = true;
								}
							}
						} else {
							continueLoop2 = false;
						}
						j += 1;
					}

					allBiddersArray.push(tempJSON);
				}
			}
		}
		else{
			continueLoop = false;
		}
		i += 1;
	}
	globalVariables.AllBidders = allBiddersArray;
	i = 0;
	let dutyListArray = [];
	continueLoop = true;
	while(continueLoop){
		let tempJSON = {day: 0, id: "", name: "", points:"", extra: false}
		if(rows[i]!==undefined){
			tempJSON.day = turnInto2DigitsNonArr(rows[i]["Day"].toString());
			for(let k =0; k<globalVariables.AllBidders.length; k++){
				if(rows[i]["DOO"]===globalVariables.AllBidders[k].name){
					tempJSON.id = globalVariables.AllBidders[k].id;
				}
			}
			tempJSON.name = rows[i]["DOO"];
			tempJSON.points = rows[i]["Pts"]
			if(rows[i]["Pts"] === "0"){
				tempJSON.extra = true;
			}
			else{
				tempJSON.extra = false;
			}
			dutyListArray.push(tempJSON);
		}
		else{
			continueLoop = false;
		}
		i += 1;
	}
	endLoading(chatId)
	return bubble_SortJSONArray(dutyListArray, "day")
}
module.exports = {
	activateBotPolling: () => {
		console.log("Bot Brain Activated...")
		bot.onText(/\/start/,async (msg, match) => {
			const chatId = msg.chat.id;
			const fromId = msg.from.id;
			if(checkCmdAcceptance(chatId)) {
				if (msg.chat.type === "private") { //if the message is sent via Private Message
					await initiateUser(fromId)
				} else if (msg.chat.type === "supergroup" || msg.chat.type === "group") {
					await startBidding(fromId, chatId, getNextMonth(new Date()));
				}
			}
		});
		bot.onText(/\/SetName (.+)/, async (msg, match) => {
			// 'msg' is the received Message from Telegram
			// 'match' is the result of executing the regexp above on the text content
			// of the message
			const fromId = msg.from.id;
			const name = match[1]; // the captured "whatever"
			//if the bot should be listening for a name
			if(checkCmdAcceptance(fromId)) {
				if (msg.chat.type === "private") {
					sendMessage(fromId,
						"<b>Your display name is: </b><i>" + name.trim() + "</i>\n\n" +
						"<i>To reset your name type: '/SetName XXXX'</i>"
					)
					await confirmName(fromId, name.trim())
				}
			}
		});
		bot.onText(/\/WGTORDL/, async (msg, match)=>{
			let fromId = msg.from.id;
			let chatId = msg.chat.id;
			if(checkCmdAcceptance(chatId)) {
				await deleteUser(fromId, chatId)
			}
		});
		bot.onText(/\/ConfirmBidDate/, async (msg, match)=>{
			let fromId = msg.from.id;
			let chatId = msg.chat.id;
			if(checkCmdAcceptance(chatId)) {
				if ((msg.chat.type === "supergroup" || msg.chat.type === "group") && globalVariables.biddingDateConfirming && checkIfBiddingAdmin(fromId)) {
					globalVariables.biddingDateConfirming = false;
					await confirmDate(chatId, fromId)
				} else if ((msg.chat.type === "supergroup" || msg.chat.type === "group") && !globalVariables.biddingDateConfirming) {
					noSession(chatId);
				} else if ((msg.chat.type === "supergroup" || msg.chat.type === "group") && globalVariables.biddingDateConfirming && !checkIfBiddingAdmin(fromId)) {
					await notBiddingAdmin(chatId)
				}
			}
		});
		bot.onText(/\/ChangeBidDate (.+)/, async (msg, match)=>{
			// 'msg' is the received Message from Telegram
			// 'match' is the result of executing the regexp above on the text content
			// of the message
			const fromId = msg.from.id;
			const chatId = msg.chat.id;
			let dateFromUser = match[1]; // the captured "date"
			dateFromUser = dateFromUser.trim();
			if(checkCmdAcceptance(chatId)) {
				if ((msg.chat.type === "supergroup" || msg.chat.type === "group") && globalVariables.biddingDateConfirming && checkIfBiddingAdmin(fromId)) {
					//validation ensuring that the entered information has a length of 7, 1 space
					dateFromUser = dateFromUser.trim()
					//console.log(dateFromUser);
					//console.log("Length: " + dateFromUser.length);
					//console.log("Index Of Space: " + dateFromUser.indexOf(" "));
					//validating length 7
					if (dateFromUser.length === 7) {
						//validating the position of the space
						if (dateFromUser.indexOf(" ") === 2) {
							//split the string by the space into a string array
							let newDateJSON = changeMonth(dateFromUser.split(" ")[0], dateFromUser.split(" ")[1])
							await startBidding(fromId, chatId, newDateJSON);
						} else {
							sendMessage(chatId, "Malformed Date, Try Again: '/ChangeBidDate DD YYYY'")
						}
					} else {
						sendMessage(chatId, "Malformed Date, Try Again: '/ChangeBidDate DD YYYY'")
					}
				} else if ((msg.chat.type === "supergroup" || msg.chat.type === "group") && !globalVariables.biddingDateConfirming) {
					noSession(chatId);
				} else if ((msg.chat.type === "supergroup" || msg.chat.type === "group") && globalVariables.biddingDateConfirming && !checkIfBiddingAdmin(fromId)) {
					await notBiddingAdmin(chatId)
				}
			}
		});
		bot.onText(/\/MeowMeow/,async (msg, match) =>{
			const fromId = msg.from.id;
			const chatId = msg.chat.id;
			//[{name:'Shenyi', id:'TelegramID', signingE: false}]
			if(checkCmdAcceptance(chatId)){
				if (globalVariables.joinBidding) {
					await joinBidding(chatId, fromId, false)
				} else {
					noSession(chatId)
				}
			}
		});
		bot.onText(/\/SigningE/,async (msg, match) =>{
			const fromId = msg.from.id;
			const chatId = msg.chat.id;
			//[{name:'Shenyi', id:'TelegramID', signingE: false}]
			if(checkCmdAcceptance(chatId)) {
				if (globalVariables.joinBidding) {
					await joinBidding(chatId, fromId, true);
				} else {
					noSession(chatId)
				}
			}
		});
		bot.onText(/\/Initiate/,async (msg, match)=>{
			const fromId = msg.from.id;
			const chatId = msg.chat.id;
			if(checkCmdAcceptance(chatId)) {
				if(fromId === globalVariables.biddingAdmin && globalVariables.joinBidding){
					//globalVariables.joinBidding = false;
					if(globalVariables.InitiateCounter < 2){
						globalVariables.initiateBidding = true;
						await confirmBiddingInformation(chatId, fromId)
						globalVariables.InitiateCounter += 1;
					}
					else {
						sendMessageI(chatId, "You have 0 tries left to re-initiate the bidding.")
					}

				}
				else{
					noSession(chatId);
				}
			}
			//console.log(turnInto2Digits(await getColumnInfo('Current Settings', doc,"Omitted Dates")))
			//console.log(await generateDutyDaysList());
		});
		bot.onText(/\/Ready/,async (msg, match)=>{
			const fromId = msg.from.id;
			const chatId = msg.chat.id;
			if(checkCmdAcceptance(chatId)) {
				if (fromId === globalVariables.biddingAdmin && globalVariables.initiateBidding){
					globalVariables.joinBidding = false;
					globalVariables.initiateBidding = false;
					await startBiddingProcess(chatId, fromId)
				}
				else{
					noSession(chatId)
				}
			}
		});
		bot.onText(/\/Continue/,async (msg, match)=>{
			const fromId = msg.from.id;
			const chatId = msg.chat.id;
			if(checkCmdAcceptance(chatId)) {
				if (fromId === globalVariables.biddingAdmin && globalVariables.biddingExtra){
					globalVariables.biddingExtra = false;
					globalVariables.biddingStart = false
					for(let i = 0; i<globalVariables.AllBidders.length; i++){
						if(globalVariables.AllBidders[i].signingE){
							globalVariables.AllBidders[i].signingE = false;
						}
					}
					await startBiddingProcess(chatId, fromId)
				}
				else{
					noSession(chatId)
				}
			}
		});
		bot.onText(/\/accio (.+)/, async (msg, match)=>{
			const fromId = msg.from.id;
			const chatId = msg.chat.id;
			let dateFromUser = match[1]; // the captured "date"
			dateFromUser = dateFromUser.trim();
			if(checkCmdAcceptance(chatId)) {
				if(globalVariables.biddingStart){
					addToDutyList(fromId, chatId, dateFromUser, globalVariables.biddingExtra)
				}
				else{
					sendMessage(chatId, "<i>Command Not Accepted.</i>")
				}
			}
		});
		bot.onText(/\/reducto (.+)/, async (msg, match)=>{
			const fromId = msg.from.id;
			const chatId = msg.chat.id;
			let dateFromUser = match[1]; // the captured "date"
			dateFromUser = dateFromUser.trim();
			if(checkCmdAcceptance(chatId)) {
				if(globalVariables.biddingStart){
					removeFromDutyList(fromId, chatId, dateFromUser, globalVariables.biddingExtra)
				}
				else{
					sendMessage(chatId, "<i>Command Not Accepted.</i>")
				}
			}
		});
		bot.onText(/\/end/,async (msg, match)=>{
			const fromId = msg.from.id;
			const chatId = msg.chat.id;
			if(checkCmdAcceptance(chatId)) {
				if(!globalVariables.biddingExtra && globalVariables.biddingStart && fromId === globalVariables.biddingAdmin){
					globalVariables.biddingStart = false
					await endBid(globalVariables.DutyList, chatId, fromId)
				}
				else{
					sendMessageI(chatId,"You cannot end the bid. Either you aren't the Admin or you're currently bidding for extras. ")
				}
			}
		});
		bot.onText(/\/DutyList/,async (msg, match)=>{
			const fromId = msg.from.id;
			const chatId = msg.chat.id;
			if(checkCmdAcceptance(chatId)){
				if(globalVariables.biddingDateJSON.month === '' || globalVariables.biddingDateJSON.year === '' || globalVariables.biddingDateJSON.month === undefined || globalVariables.biddingDateJSON.year === undefined){
					let newDates = await getMonthYearFromSheet("Current Settings", doc)
					let newDutyList = await dutyListCurrent(chatId,fromId)
					globalVariables.biddingDateJSON = newDates
					//console.log(globalVariables.AllBidders);
					await endBidMessage(newDutyList, chatId);
				}
				else{
					await endBidMessage(await dutyListCurrent(chatId,fromId), chatId);
				}
			}
		});
		bot.on('message',  (msg) => {
			const chatId = msg.chat.id;
			//console.log(msg)
		});
	}
}
