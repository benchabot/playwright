/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { BrowserContext, BrowserContextOptions, BrowserContextBase, PersistentContextOptions } from './browserContext';
import { Page } from './page';
import { EventEmitter } from 'events';
import { Download } from './download';
import type { BrowserServer } from './server/browserServer';
import { Events } from './events';
import { Loggers } from './logger';
import { ProxySettings } from './types';

export type BrowserOptions = {
  loggers: Loggers,
  downloadsPath?: string,
  headful?: boolean,
  persistent?: PersistentContextOptions,  // Undefined means no persistent context.
  slowMo?: number,
  ownedServer?: BrowserServer,
  proxy?: ProxySettings,
};

export interface Browser extends EventEmitter {
  newContext(options?: BrowserContextOptions): Promise<BrowserContext>;
  contexts(): BrowserContext[];
  newPage(options?: BrowserContextOptions): Promise<Page>;
  isConnected(): boolean;
  close(): Promise<void>;
}

export abstract class BrowserBase extends EventEmitter implements Browser {
  readonly _options: BrowserOptions;
  private _downloads = new Map<string, Download>();
  _defaultContext: BrowserContextBase | null = null;

  constructor(options: BrowserOptions) {
    super();
    this._options = options;
  }

  abstract newContext(options?: BrowserContextOptions): Promise<BrowserContext>;
  abstract contexts(): BrowserContext[];
  abstract isConnected(): boolean;
  abstract _disconnect(): void;

  async newPage(options?: BrowserContextOptions): Promise<Page> {
    const context = await this.newContext(options);
    const page = await context.newPage();
    page._ownedContext = context;
    return page;
  }

  _downloadCreated(page: Page, uuid: string, url: string, suggestedFilename?: string) {
    const download = new Download(page, this._options.downloadsPath || '', uuid, url, suggestedFilename);
    this._downloads.set(uuid, download);
  }

  _downloadFilenameSuggested(uuid: string, suggestedFilename: string) {
    const download = this._downloads.get(uuid);
    if (!download)
      return;
    download._filenameSuggested(suggestedFilename);
  }

  _downloadFinished(uuid: string, error?: string) {
    const download = this._downloads.get(uuid);
    if (!download)
      return;
    download._reportFinished(error);
    this._downloads.delete(uuid);
  }

  async close() {
    if (this._options.ownedServer) {
      await this._options.ownedServer.close();
    } else {
      await Promise.all(this.contexts().map(context => context.close()));
      this._disconnect();
    }
    if (this.isConnected())
      await new Promise(x => this.once(Events.Browser.Disconnected, x));
  }
}

