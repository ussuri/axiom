// Copyright 2014 Google Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import AxiomError from 'axiom/core/error';
import Path from 'axiom/fs/path';

/** @typedef JsExecuteContext$$module$axiom$fs$js$execute_context */
var JsExecuteContext;

/**
 * @param {JsExecuteContext} cx
 * @return {void}
 */
export var main = function(cx) {
  cx.ready();

  var list = cx.getArg('_', []);
  if (list.length === 0 || cx.getArg('help')) {
    cx.stdout.write([
      'usage: mkdir <path> ...',
      'Create one or more new directories.',
      '',
      'All parent directories must already exist.'
    ].join('\r\n') + '\r\n');
    cx.closeOk();
    return;
  }

  var fileSystem = cx.fileSystemManager;
  var errors = false;

  var mkdirNext = function() {
    if (!list.length) {
      return;
    }

    /** @type {string} */
    var pathSpec = list.shift();
    /** @type {Path} */
    var path = Path.abs(cx.getPwd(), pathSpec);

    return fileSystem.mkdir(path)
      .then(function() {
        return mkdirNext();
      })
      .catch(function(e) {
        errors = true;
        cx.stdout.write(
            'mkdir: ' + path.originalSpec + ': ' + e.toString() + '\n');
        return mkdirNext();
      });
  };

  mkdirNext().then(function() {
    if (errors) {
      cx.closeError(
          new AxiomError.Runtime('Some directories could not be created'));
    } else {
      cx.closeOk();
    }
  });
};

export default main;

main.signature = {
  'help|h': '?',
  '_': '@'
};
