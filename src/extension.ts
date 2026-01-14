import * as vscode from 'vscode';
import { AhkTestController } from './testController';

export function activate(context: vscode.ExtensionContext) {
    const controller = new AhkTestController(context);
    context.subscriptions.push(controller);
}

export function deactivate() {}