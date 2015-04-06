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
import Completer from 'axiom/core/completer';
import DataType from 'axiom/fs/data_type';
import Path from 'axiom/fs/path';

/** @typedef ExecuteContext$$module$axiom$fs$base$execute_context */
var ExecuteContext;

/** @typedef FileSystemManager$$module$axiom$fs$base$file_system_manager */
var FileSystemManager;

/**
 * @param {ExecuteContext} cx
 *
 * @return {void}
 */
export var main = function(cx) {
  cx.ready();

  /** @type {Array<string>} */
  var list = cx.getArg('_', []);

  /** @type {boolean} */
  var forceSingleFile = cx.getArg('file');

  if (list.length > 1 || cx.getArg('help')) {
    cx.stdout.write([
      'usage: import [<target-directory>] [-f|--file]',
      'Import a directory from the local file system.',
      '',
      'If <target-directory> is provided, the file(s) will be imported there.',
      'If not, they will be imported into the current directory.',
      '',
      'Imports a directory by default (if supported by browser).  If -f is',
      'provided, only a single file is imported.'
    ].join('\r\n') + '\r\n');
    cx.closeOk();
    return;
  }

  /** @type {string} */
  var pathSpec = list.length ? list.shift() : '.';
  /** @type {string} */
  var pwd = cx.getPwd();
  /** @type {Path} */
  var path = Path.abs(pwd, pathSpec);

  /** @type {ImportCommand} */
  var command = new ImportCommand(cx);

  // NOTE: cx will get closed in ImportCommand.prototype.handleFileSelect_().
  command.import(path, forceSingleFile);
};

export default main;

main.signature = {
  'file|f': '?',
  'help|h': '?',
  '_': '@'
};

/**
 * @constructor
 * Import a directory of files for use in wash.
 *
 * @param {ExecuteContext} executeContext
 */
var ImportCommand = function(cx) {
  /** @type {Path} The target directory of the import*/
  this.destination = null;

  /** @private @type {ExecuteContext} */
  this.cx_ = cx;

  /** @private @type {FileSystemManager} */
  this.fsm_ = cx.fileSystemManager;

  /** @type {Element} An element which, if we return focus to it, will tell us
                      that the user has canceled the import. */
  this.dummyFocusInput_ = null;

  /** @type {Element} The file / directory chooser input. */
  this.input_ = null;

  /** @private @type {?boolean} Force import of single file*/
  this.singleFile_ = null;

  /** @type {Element} The originally focused element to restore. */
  this.originalFocusElement_ = null;

  /** @type {boolean} Files have been selected (remove cancel handler). */
  this.filesChosen_ = false;
};

/**
 * Prompt the user to import a directory or file
 *
 * @param {Path} Destination path
 * @param {boolean} Import single file
 * @return {void}
 */
ImportCommand.prototype.import = function(destination, forceSingleFile) {
  this.destination = destination;
  this.singleFile_ = forceSingleFile;
  this.originalFocusElement_ = document.activeElement;

  /** @type {Element} */
  var dummyFocusInput = document.createElement('input');
  dummyFocusInput.setAttribute('type', 'text');
  document.body.appendChild(dummyFocusInput);
  dummyFocusInput.focus();
  this.dummyFocusInput_ = dummyFocusInput;

  /** @type {Element} */
  var input = document.createElement('input');
  input.setAttribute('type', 'file');
  if (!forceSingleFile) {
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('multiple', '');
  }
  
  input.style.cssText =
      'position: absolute;' +
      'right: 0';

  this.input_ = input;

  input.addEventListener('change', this.handleFileSelect_.bind(this), false);

  document.body.appendChild(input);

  input.click();

  // Localize the handler so we can remove it later.
  this.handleFileCancel_ = this.handleFileCancel_.bind(this);

  // Cancellation is detected by creating a text field and giving it focus.
  // When the field gets focus again, and the `change` handler (above) hasn't
  // fired, we know that a cancel happened.
  dummyFocusInput.addEventListener('focus', this.handleFileCancel_, false);
};

/**
 * Mkdir, including parent directories
 * @private
 * @param {Path} path
 * @return {Promise}
 */
ImportCommand.prototype.mkdirParent_ = function(path) {
  var parentPath = path.getParentPath();
  if (parentPath === null) return Promise.resolve(null);
  return this.mkdirParent_(parentPath).then(function() {
    return this.fsm_.mkdir(path).catch(function (e) {
      if (AxiomError.Duplicate.test(e)) {
        return Promise.resolve();
      }
      return Promise.reject(e);
    });
  }.bind(this));
};

/**
 * Handle the cancelation of choosing a file / directory.
 *
 * @private
 * @param {Event} evt
 * @return {void}
 */
ImportCommand.prototype.handleFileCancel_ = function(evt) {
  // This handles a race condition between the cancel and select events which
  // cause spurious results This keeps things in the right order (100ms is
  // probably overkill, but mostly undetectable).
  setTimeout(function() {
    if (this.filesChosen_) return;
    this.destroy_();
    this.cx_.closeError(new AxiomError.Missing('file selection'));    
  }.bind(this), 100);
}

/**
 * Handle the selection of a file on this.input_
 *
 * @private
 * @param {Event} evt
 * @return {void}
 */
ImportCommand.prototype.handleFileSelect_ = function(evt) {
  this.filesChosen_ = true;

  /** @type {FileList} */
  var files = evt.target.files;

  /** @type {!Array<Promise>} */
  var copyPromises = [];

  var onFileLoad = function(data, evt) {
    /** @type {ArrayBuffer|Blob|string} */
    var fileContent = evt.target.result;

    /** @type {Path} */
    var path = data.path;

    /** @type {Completer} */
    var fileCompleter = data.completer;

    var parentDirectory = path.getParentPath();
    this.fsm_.stat(parentDirectory).catch(function(e) {
      if (AxiomError.NotFound.test(e)) {
        return this.mkdirParent_(parentDirectory);
      }
      return Promise.reject(e);
    }.bind(this)).then(function(result) {
      return this.fsm_.writeFile(path, DataType.Value, fileContent);
    }.bind(this)).then(function() {
      fileCompleter.resolve(null);
    }.bind(this)).catch(function(e) {
      fileCompleter.resolve(e);
    });
  };

  for (var i = 0; i < files.length; i++) {
    /** @type {!File} */
    var f = files[i];

    /** @type {string} */
    var relativePath =
        /** @type {!{webkitRelativePath: string}} */(f).webkitRelativePath

    if (relativePath === undefined || this.singleFile_) {
      relativePath = /** @type {{name: string}} */(f).name;
    }

    var path = Path.abs(this.destination.spec, relativePath);

    var reader = new FileReader();

    /** @type {Completer} */
    var fileCompleter = new Completer();

    /** @type {{path:Path, completer:Completer}} */
    var data = {
      path: path,
      completer: fileCompleter
    };

    reader.onload = onFileLoad.bind(this, data);

    copyPromises.push(fileCompleter.promise);

    reader.readAsBinaryString(f);
  }

  Promise.all(copyPromises).then(function (values) {
    this.destroy_();

    /** @type {Array<Error>} */
    var errors = values.filter(function(element) { return element !== null; });

    if (errors.length === 0) {
      this.cx_.closeOk();
    } else {
      this.cx_.closeError(new AxiomError.Unknown(errors));
    }
  }.bind(this));
};

/**
 * Cleanup after command finishes
 *
 * @private
 * @return {void}
 */
ImportCommand.prototype.destroy_ = function() {
  document.body.removeChild(this.input_);
  document.body.removeChild(this.dummyFocusInput_);

  // TODO(umop): Fix focus issue
  // Return focus to the `activeElement` which is the iframe with `hterm` in it.
  // This causes the cursor to lose its focus style (hollow cursor instead of
  // block cursor), but does not actually cause the terminal to lose focus.
  this.originalFocusElement_.focus();
}
