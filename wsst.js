#!/usr/bin/env node

/*
Copyright (c) 2011 Bogdan Tkachenko <bogus.weber@gmail.com>

Tool written in NodeJS that allows to make a stress test for
your application that uses WebSockets

This file is part of WebSockets Stress Test.

WebSockets Stress Test is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * WebSockets Stress Test
 *
 * Tool written in NodeJS that allows to make a stress test for
 * your application that uses WebSockets. You can create behavior
 * scenarios that tool will run on every connection in test.
 *
 * @author Bogdan Tkachenko <bogus.weber@gmail.com>
 * @version 0.1
 */

var
    cli       = require('cli'),
    querystring = require('querystring'),
    io = require('socket.io-client'),
    AsciiTable = require('ascii-table');

var checkFinished = function(params) {
    // If we haven't any another connections
    if (params.countOpened === params.countClosed && params.countOpened == params.countConnections && params.countClosed == params.countConnections) {
        // Save test end time
        var endTime = (new Date()).getTime();

        // Prepare result
        var result = {
            connections:  params.countConnections,
            scenarioName: params.scenarioName,
            url:          params.url,
            total:        (endTime - params.startTime),
            avg:          0,
            min:          null,
            max:          null,
            checkpoints:  []
        };

        for (var i in params.connections) {
            // Calculate total connection time
            var connectionTime = 0;
            if (params.connections[i].checkpoints.length) {
                connectionTime = params.connections[i].checkpoints[params.connections[i].checkpoints.length-1].end - params.connections[i].checkpoints[0].start;
            }

            result.avg += connectionTime;

            if (connectionTime < result.min || result.min === null) {
                result.min = connectionTime;
            }

            if (connectionTime > result.max || result.max === null) {
                result.max = connectionTime;
            }

            // And now for every checkpoint
            for (var j in params.connections[i].checkpoints) {
                if (!result.checkpoints[j]) {
                    result.checkpoints[j] = {
                        text: params.connections[i].checkpoints[j].text,
                        avg:  0,
                        min:  null,
                        max:  null
                    };
                }

                result.checkpoints[j].avg += params.connections[i].checkpoints[j].total;

                if (result.checkpoints[j].min > params.connections[i].checkpoints[j].total || result.checkpoints[j].min === null) {
                    result.checkpoints[j].min = params.connections[i].checkpoints[j].total;
                }

                if (result.checkpoints[j].max < params.connections[i].checkpoints[j].total || result.checkpoints[j].max === null) {
                    result.checkpoints[j].max = params.connections[i].checkpoints[j].total;
                }
            }
        }

        result.avg /= params.countConnections;
        for (var j in result.checkpoints) {
            result.checkpoints[j].avg /= params.countConnections;
        }

        cli.ok('');
        cli.ok('Test completed!');
        cli.ok('--------------------------------------------------');
        cli.ok('Total test time:             ' + result.total + ' ms.');
        cli.ok('Average time per connection: ' + result.avg + ' ms.');
        cli.ok('Minimum connection time:     ' + result.min + ' ms.');
        cli.ok('Maximum connection time:     ' + result.max + ' ms.');
        cli.ok('--------------------------------------------------\n');

        cli.ok('Time profiler:');

        var table = new AsciiTable();
        table.setHeading('Average', 'Minimum', 'Maximum', 'Name');
        for (var c in result.checkpoints) {
            table.addRow(
                result.checkpoints[c].avg,
                result.checkpoints[c].min,
                result.checkpoints[c].max,
                result.checkpoints[c].text
            );
        }

        console.log(table.toString());

        if (typeof params.callback === 'function') {
            params.callback.call(cli, result);
        }
    }
};

var singleConnectionTest = function(index, params) {
    var connectionUrl = params.url;
    if (params.getConnectionParams) {
        connectionUrl += "&"+querystring.stringify(params.getConnectionParams());
    }

    params.connections[index] = {
        socket:      io(connectionUrl, {
            forceNew: true,
            reconnect: false
        }),
        checkpoints: []
    };

    var api = {
        /**
         * Create checkpoint in scenario
         *
         * @param text
         */
        checkpoint: function (text) {
            var time = (new Date()).getTime();
            var count = params.connections[index].checkpoints.length;

            if (count > 0) {
                params.connections[index].checkpoints[count - 1].end = time;
                params.connections[index].checkpoints[count - 1].total = time;
                params.connections[index].checkpoints[count - 1].total -= params.connections[index].checkpoints[count - 1].start;
            }

            params.connections[index].checkpoints.push({
                text:   text,
                start:  time,
                end:    time,
                total:  0
            });

            cli.debug('Checkpoint (conn #'+index+'): ' + text);
        }
    };

    params.connections[index].socket.on('connect', function () {
        params.countOpened++;

        // Add default checkpoint when connection opens
        api.checkpoint('Connection opened');

        // And run scenario on this connection
        params.scenario.init(params.connections[index].socket, api);
    });

    params.connections[index].socket.on('disconnect', function () {
        // Add default checkoint when connection closed
        api.checkpoint('Connection closed');
        params.countClosed++;

        checkFinished(params);
    });
};

/**
 * Run single test for given scenario on given URL.
 *
 * Result passed to callback
 *
 * @param webSocketUrl
 * @param scenarioName
 * @param countConnections
 * @param cli
 * @param callback
 */
var test = function (webSocketUrl, scenarioName, countConnections, options, cli, callback) {
    var params = {
        connections: [],
        scenarioName: scenarioName,
        scenario: require(scenarioName[0] === '/' ? scenarioName : process.cwd() + "/" + scenarioName),
        startTime: (new Date()).getTime(),
        callback: callback,
        countConnections: countConnections,
        countOpened: 0,
        countClosed: 0,
        getConnectionParams: null,
    };

    params.url = webSocketUrl + (params.scenario.path ? params.scenario.path : '');

    if (options.connectionParamsFile) {
        var connectionParamsPath = options.connectionParamsFile;
        if (options.connectionParamsFile[0] !== '/') {
            connectionParamsPath = process.cwd() + "/" + options.connectionParamsFile;
        }

        params.getConnectionParams = require(connectionParamsPath);
    }

    cli.info('Scenario: ' + params.scenario.name);
    cli.info(params.scenario.description);
    cli.info('-----------------------------\n');
    cli.info('Starting test for ' + params.countConnections + ' connections...');

    for (var i = 0; i < params.countConnections; i++) {
        singleConnectionTest(i, params);
    }
};

/**
 * Write test results to file in JSON format
 *
 * @param fileName
 * @param data
 */
var writeJson = function (fileName, data) {
    var fs = require('fs');

    // TODO: getting error on this line. don't know how to fix
    //fs.writeFile(fileName, data);
};

/**
 * Run several tests for scenario on given URL
 *
 * @param webSocketUrl
 * @param scenarioName
 * @param countConnections
 * @param cli
 * @param callback
 */
var multipleTest = function (webSocketUrl, scenarioName, countConnections, cli, callback) {
    var
        i = 0, results = [];

    var singleTest = function (result) {
        if (result) {
            results.push(result);
        }

        if (countConnections[i]) {
            test(webSocketUrl, scenarioName, countConnections[i], cli, singleTest);
            i++;
        } else {
            callback.call(cli, results);
        }
    };

    singleTest();
};

cli.setUsage(
    cli.app + ' [OPTIONS] <URL> <scenario>\n\n' +
    '\x1b[1mExample\x1b[0m:\n ' +
    ' ' + cli.app + ' --connections 100 ws://localhost:8080 myScenario.js'
);

cli.parse({
    connections:            ['c', 'Single test for specified count of connections', 'int', '100'],
    connectionsList:        ['l', 'Multiple tests for specified list count of connections (-l 1,10,100,1000)', 'string'],
    output:                 ['o', 'File to save JSON result', 'file'],
    connectionParamsFile:   ['p', 'Connect params for each connection', 'file'],
});

cli.main(function (args, options) {
    if (args.length !== 2) {
        cli.fatal('Wrong number of arguments. Must be exactly 2 arguments! See `' + cli.app + ' -h` for details');
    }

    var connections;

    if (options.connectionsList) {
        connections = options.connectionsList.split(',');

        multipleTest(args[0], args[1], connections, options, cli, function (result) {
            if (options.output) {
                writeJson(result);
            }
        });
    } else {
        test(args[0], args[1], options.connections, options, cli, function (result) {
            if (options.output) {
                writeJson([result]);
            }
        });
    }
});
