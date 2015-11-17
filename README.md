[![npm version](https://badge.fury.io/js/wsst.svg)](https://badge.fury.io/js/wsst)

Description
-----------------

WebSockets Stress Test - Tool written in NodeJS that allows to make a stress test
for your application that uses WebSockets. You can create behavior scenarios that
tool will run on every connection in test.

Installation
------------

    npm install -g wsst

Usage
-----

    //Help
   	wsst -h

    //Run 100 connections
    wsst -c 100 ws://localhost:1080 your-scenario.js