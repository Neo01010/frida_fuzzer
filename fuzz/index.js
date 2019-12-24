/*

   frida-fuzzer - frida agent instrumentation
   ------------------------------------------

   Written and maintained by Andrea Fioraldi <andreafioraldi@gmail.com>
   Based on American Fuzzy Lop by Michal Zalewski

   Copyright 2019 Andrea Fioraldi. All rights reserved.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at:

     http://www.apache.org/licenses/LICENSE-2.0

 */

var stages = require("./stages.js");
var config = require("./config.js");
var mutator = require("./mutator.js");
var instr = require("./instrumentor.js");
var bitmap = require("./bitmap.js");
var queue = require("./queue.js");
var state = require("./state.js");
var utils = require("./utils.js");

exports.stages = stages;
exports.config = config;
exports.mutator = mutator;
exports.instr = instr;
exports.bitmap = config;
exports.queue = queue;
exports.state = state;
exports.utils = utils;

/* Define this to exclude other modules from instrumentation */
exports.target_module = null;
/* MANDATORY: harness function */
exports.fuzzer_test_one_input = null;
/* If true, the user has to call fuzzing_loop() manually in a callback
   (see Java example, fuzzing_loop cannot be called during script loading) */
exports.manual_loop_start = false;
exports.init_callback = function () {}

// by default stages are from FidgetyAFL
exports.stages_list = [
  stages.havoc_stage,
  stages.splice_stage,
];

exports.dictionary = [];

function normalize_dict () {

  var d = exports.dictionary;
  // Accepted types are: Array Uint8Array ArrayBuffer String
  for (var i = 0; i < d.length; ++i) {
  
    if (Array.isArray(d[i]) || (d[i] instanceof ArrayBuffer))
      d[i] = new Uint8Array(d[i]);

    else if (typeof d[i] === 'string' || (d[i] instanceof String))
      d[i] = utils.str_to_uint8arr(d[i]);

    else if (!(d[i] instanceof Uint8Array))
      throw "ERROR: unsupported type for a fuzzer dictionary";
  
  }

}

exports.fuzzing_loop = function () {

  if (exports.fuzzer_test_one_input === null) {
    throw "ERROR: fuzzer_test_one_input not set! Cannot start the fuzzing loop!";
  }

  var payload = null; // Uint8Array

  function runner(/* ArrayBuffer */ arr_buf) {
    
    payload = new Uint8Array(arr_buf);
    if (payload.length > config.MAX_FILE)
      payload = payload.slice(0, config.MAX_FILE);

    exports.fuzzer_test_one_input(payload);

  }
  
  normalize_dict();
  
  Process.setExceptionHandler(function (details) {
    send({
      "event": "crash",
      "err": details,
      "stage": state.stage_name
    }, payload);
    return false;
  });
  
  instr.start_tracing(Process.getCurrentThreadId(), exports.target_module);

  console.log(" >> Dry run...");

  stages.dry_run(runner);

  console.log(" >> Starting fuzzing loop...");
  
  while (true) {

    var buf = queue.next();

    for(var stage of exports.stages_list)
      stage(buf, runner);

  }

}

rpc.exports.loop = function () {

  exports.init_callback();

  if (exports.manual_loop_start) return;

  exports.fuzzing_loop();

}

