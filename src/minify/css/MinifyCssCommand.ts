import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as extend from 'extend';
import * as mkpath from 'mkpath';

import CleanCSS = require("clean-css");
import minjs = require('uglify-js');
import Configuration = require("../../Configuration");
import StatusBarMessage = require("../../StatusBarMessage");
import StatusBarMessageTypes = require("../../StatusBarMessageTypes");

class MinifyCssCommand {
    public constructor(
        private document: vscode.TextDocument,
        private lessDiagnosticCollection: vscode.DiagnosticCollection) {
    }

    public execute() {
        StatusBarMessage.hideError();
        let opts = {
            processImport: false,
            rebase: false,
            advanced: true,
            groupmedia: false
        }

        let globalOptions = Configuration.getGlobalOptions(this.document.fileName, 'css');
        let compilingMessage = StatusBarMessage.show("$(zap) Minifing css", StatusBarMessageTypes.INDEFINITE);
        let startTime: number = Date.now();
        opts = extend({}, opts, globalOptions);

        let filename = this.document.fileName;

        readFilePromise(filename).then(buffer => {
            let content: string = buffer.toString();
            if (opts.groupmedia) {
                let grouper = require('group-css-media-queries');
                content = grouper(content);
            }
            let output = new CleanCSS(opts).minify(content);           
            let newFilename = filename.endsWith('.min.css') ? filename : path.resolve(path.dirname(filename), path.basename(filename, '.css') + '.min.css')
            return writeFileContents(newFilename, output.styles);
        }).then(() => {
            let elapsedTime: number = (Date.now() - startTime);
            compilingMessage.dispose();
            this.lessDiagnosticCollection.set(this.document.uri, []);

            StatusBarMessage.show(`$(check) Css minified in ${elapsedTime}ms`, StatusBarMessageTypes.SUCCESS);
        }).catch((error: any) => {
            let message: string = error.message;
            let range: vscode.Range = new vscode.Range(0, 0, 0, 0);

            if (error.code) {
                // fs errors
                let fileSystemError = error;
                switch (fileSystemError.code) {
                    case 'EACCES':
                    case 'ENOENT':
                        message = `Cannot open file '${fileSystemError.path}'`;
                        let firstLine: vscode.TextLine = this.document.lineAt(0);
                        range = new vscode.Range(0, 0, 0, firstLine.range.end.character);
                }
            }
            else if (error.line !== undefined && error.column !== undefined) {
                // less errors, try to highlight the affected range
                let lineIndex: number = error.line - 1;
                let affectedLine: vscode.TextLine = this.document.lineAt(lineIndex);
                range = new vscode.Range(lineIndex, error.column, lineIndex, affectedLine.range.end.character);
            }

            compilingMessage.dispose();
            let diagnosis = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
            this.lessDiagnosticCollection.set(this.document.uri, [diagnosis]);

            StatusBarMessage.show("$(alert) Error compiling less (more detail in Errors and Warnings)", StatusBarMessageTypes.ERROR);
        });
    }
}

export = MinifyCssCommand;


function writeFileContents(this: void, filepath: string, content: any): Promise<any> {
    return new Promise((resolve, reject) => {
        mkpath(path.dirname(filepath), err => {
            if (err) {
                return reject(err);
            }

            fs.writeFile(filepath, content, err => err ? reject(err) : resolve());
        });
    });
}

function readFilePromise(this: void, filename: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        fs.readFile(filename, (err: any, buffer: Buffer) => {
            if (err) {
                reject(err)
            }
            else {
                resolve(buffer);
            }
        });
    });
}