// @ts-nocheck
/*
 * #Author       : sterben(Duan)
 * #LastAuthor   : sterben(Duan)
 * #Date         : 2020-02-15 15:44:35
 * #lastTime     : 2020-02-15 17:26:23
 * #FilePath     : \src\extension.js
 * #Description  : 
 */
'use strict';

const vscode   = require("vscode");

const tool     = require("HDLtool");
const linter   = require("HDLlinter");
const parser   = require("HDLparser");
const filesys  = require("HDLfilesys");

function activate(context) {
    var HDLparam = [];
    let HDLFileList = [];
    let opeParam = {
        "os"             : "",
        "rootPath"       : "",
        "workspacePath"  : "",
        "currentSrcPath" : "",
        "prjInitParam"   : "",
        "propertyPath"   : ""
    }
    filesys.prjs.getOpeParam(`${__dirname}`,opeParam);
    filesys.prjs.refreshPrjFiles(opeParam.workspacePath, HDLFileList);
    HDLFileList = HDLFileList.concat(filesys.prjs.getLibParam(opeParam));

	// Output Channel
	var outputChannel = vscode.window.createOutputChannel("HDL");

    // Status Bar
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
	context.subscriptions.push(statusBar);

    const indexer = new parser.indexer(statusBar, HDLparam);
    indexer.build_index(HDLFileList).then(() => {
        console.log(indexer.HDLparam);
        indexer.updateMostRecentSymbols(undefined);
        var vlogComplete = new tool.lspCompletion.vlogCompletion(indexer.HDLparam);
        var fileExplorer = new tool.tree.FileExplorer(indexer.HDLparam, opeParam);
        filesys.monitor.threadMonitor(outputChannel, opeParam);
        filesys.monitor.monitor(opeParam.workspacePath, opeParam, indexer, () => {
            vlogComplete.HDLparam = indexer.HDLparam;
            fileExplorer.treeDataProvider.HDLparam = indexer.HDLparam;
            fileExplorer.treeDataProvider.refresh();
        });
        // linter Server
        linter.registerLinterServer(context);
        // project Server
        filesys.registerPrjsServer(context, opeParam);
        // tool Server
        tool.registerTreeServer(opeParam);
        tool.registerSimServer(indexer, opeParam);
        tool.registerLspServer(context, indexer, vlogComplete);
        tool.registerBuildServer(context, indexer, opeParam);
        tool.registerXilinxDesigner(opeParam);
    });
}
exports.activate = activate;
function deactivate() {}
exports.deactivate = deactivate;