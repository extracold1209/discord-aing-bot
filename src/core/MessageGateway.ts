import _glob from 'glob';
import {promisify} from 'util';
import path from 'path';
import type {Message} from 'discord.js';
import type BaseCommand from '@commands/base/BaseCommand';
import {MessageValidator} from '@validators/base/BaseValidator';

const glob = promisify(_glob);
const PREFIX_LENGTH_LIMIT = 3; // prefix 가 너무 길면 좀 그렇잖아

class MessageGateway {
    private _prefix = '!';
    private commands: { [command: string]: BaseCommand } = {};

    get prefix() {
        return this._prefix;
    }

    set prefix(prefix: string) {
        if (prefix.length >= PREFIX_LENGTH_LIMIT) {
            console.warn('prefix is too long. it should be under 3 characters');
            return;
        }

        // [workaround] prefix 로 특수문자만 허용한다
        if (!prefix.match(/^[\W|_]+/g)) {
            console.warn('prefix must be special characters');
            return;
        }

        this._prefix = prefix;
    }

    public async initializeCommand() {
        const commandsDirPathGlob = path.join(__dirname, '../commands', '*.ts');
        const modulePaths = await glob(commandsDirPathGlob);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const esModules = await Promise.all(modulePaths.map<any>((modulePath) => import(modulePath)));
        const modules: BaseCommand[] = esModules.map((esModule) => esModule.default);

        modules.forEach((commandModule) => {
            this.commands[commandModule.command] = commandModule;
        });

        return modules; // for test
    }

    public async handleMessage(message: Message) {
        if (message.content.startsWith(this.prefix)) {
            const command = this.commands[message.content.slice(1)];
            if (command) {
                const chainCompleted = await this.processValidatorChain(message, command.validators);
                chainCompleted && command.execute(message);
            }
        }
    }

    private async processValidatorChain(target: Message, validators: MessageValidator[]): Promise<boolean> {
        for (let i = 0 ; i < validators.length ; i++) {
            const validator = validators[i];
            const validationResult = await new Promise<boolean>((resolve) => {
                validator.validate(target).then(resolve);
            });

            if (!validationResult) {
                return false;
            }
        }
        return true;
    }
}

export default MessageGateway;
