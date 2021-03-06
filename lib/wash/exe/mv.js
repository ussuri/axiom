// Copyright 2015 Google Inc. All rights reserved.
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
  if (list.length != 2 || cx.getArg('help')) {
    cx.stdout.write([
      'usage: mv <source> <destination>',
      'Move a file to a new location.',
      '',
      'If both locations are on the same file system this will perform an',
      'atomic move.  If not, it\'ll perform a copy and delete (see `cp -h` ',
      'for the details on how copying works).'
    ].join('\r\n') + '\r\n');
    cx.closeOk();
    return;
  }

  /** @type {string} */
  var fromPathSpec = list[0];
  /** @type {string} */
  var toPathSpec = list[1];
  /** @type {string} */
  var pwd = cx.getPwd();

  /** @type {Path} */
  var fromPath = Path.abs(pwd, fromPathSpec);
  /** @type {Path} */
  var toPath = Path.abs(pwd, toPathSpec);

  cx.fileSystemManager.move(fromPath, toPath)
    .then(function() {
      cx.closeOk();
    }).catch(function(err) {
      cx.closeError(err);
    });
};

export default main;

main.signature = {
  'help|h': '?',
  '_': '@'
};
