var casper = require('casper').create({
//    verbose: true,
    logLevel: 'debug',
});

var segment = 'tweets';
//var segment = 'ostypes';
//var segment = 'places';
//var segment = 'genders';
//var segment = 'interests';
//var segment = 'handles';
//var segment = 'keywords';
//var segment = 'tv_shows';

var startDate = createDate( new Date(2015, 2-1, 1) );
var endDate   = createDate( new Date(2015, 2-1, 15+1) );
casper.echo('startDate = ' + decodeURIComponent(startDate));
casper.echo('endDate   = ' + decodeURIComponent(endDate));

casper.start();

casper.open('https://twitter.com/login?redirect_after_login=https%3A%2F%2Fads.twitter.com%2F');

casper.then(function() {
    this.fill('form.signin', {
        'session[username_or_email]' : casper.cli.get('username'),
        'session[password]'          : casper.cli.get('password'),
    }, true);
});

casper.wait(1000);

var campaignList = new Array();
var defaultJsonUrl = 'https://ads.twitter.com/accounts/18ce53x85lg/campaigns_dashboard/data.json?endString=' + endDate + '&fi=31659202&lang=ja&startString=' + startDate + '&summary_metric=impressions&search_initiated=false';
var currentJsonUrl = defaultJsonUrl;

casper.then(makeCampaignList);

function makeCampaignList() {
    var jsonData;

    this.download(currentJsonUrl, 'data.json');
    this.then(function () {
        var fs = require('fs');
        jsonData = fs.read('data.json');
    });

    this.then(function () {
        var result = this.evaluate(getCampaigns, jsonData);
        var next = result.next;
        campaignList = campaignList.concat(result.campaigns);

        this.echo('campaignCounter : ' + campaignList.length);

        if (next) {
            currentJsonUrl = defaultJsonUrl + '&cursor=' + next;
            casper.then(makeCampaignList);
        }
    });
}

var count = -1;
casper.then(loop);

function loop() {
    count++;
    if (campaignList.length === count) {
        return;
    }
    if (campaignList[count].id) {
        casper.then(exportData);
        casper.then(getCsv);
    }
    casper.then(loop);
}

var exportUrl;
function exportData() {
    exportUrl = 'https://ads.twitter.com/accounts/18ce53x85lg/segments/export_data.json?campaign=' + campaignList[count].id + '&endString='+ endDate + '&lang=ja&startString=' + startDate + '&segment=' + segment + '&summary_metric=impressions&cursor=&format=csv&granularity=day';
    this.echo(exportUrl);
    casper.then(confirmData);
}

function confirmData() {
    var jsonData;

    this.download(exportUrl, 'export_data.json');
    this.then(function () {
        var fs = require('fs');
        jsonData = fs.read('export_data.json');
    });

    this.then(function (){
        var json = JSON.parse(jsonData);
        this.echo(json.status);
        if (json.status !== 'Available') {
            casper.then(confirmData);
        }
    });
}

function getCsv() {
    var fileUrl = 'https://ads.twitter.com/accounts/18ce53x85lg/segments/bundle?campaign=' + campaignList[count].id + '&endString='+ endDate + '&lang=ja&startString=' + startDate + '&segment=' + segment + '&summary_metric=impressions&cursor=&format=csv&granularity=day';
    this.echo(fileUrl);
    this.download(fileUrl, 'data/' + campaignList[count].name + '.csv');
}

casper.then(function () {
    var fs = require('fs');

    fs.write('result.csv', '', 'w');

    var files = fs.list(fs.workingDirectory + '/data');
    files.forEach(function (file) {
        var regexpResult = file.match(/(.+)\.csv/);
        if ( regexpResult ) {
            console.log(file);
            var fileName = regexpResult[1];
            var data = fs.read('data/' + file);
            var deletedData = data.replace(/^.+$\n/m, '');
            var dataWithCampaign = deletedData.replace(/^\"/mg, '"' + fileName + '","');

            fs.write('result.csv', dataWithCampaign, 'a');
        }
    });
});

casper.run();

function createDate(date) {
    var dateString = date.getFullYear() + '-' + (date.getMonth()+1) + '-' + date.getDate() + 'T' + date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds() + '.000';
    return encodeURIComponent(dateString);
}

function getCampaigns(jsonData) {
    var json = JSON.parse(jsonData);
    document.body.innerHTML = json.rows_html;
    var campaignNames = document.querySelectorAll('.campaign-name');
    var campaigns = new Array();
    for (var i=0; i< campaignNames.length; i++) {
        var link = campaignNames[i].querySelector('a');
        if (!link) {
            campaigns[i] = { name : campaignNames[i].innerText, id : undefined }
            continue;
        }
        var href = link.getAttribute('href');
        var campaignId = href.match(/campaign=(\d+)&/)[1];
        campaigns[i] = { name : campaignNames[i].innerText, id : campaignId };
    }
    return { campaigns : campaigns, next : json.cursor.next };
}
