import { registerPlugin } from '@capacitor/core';

export interface ExportedFile {
  filename: string;
  uri: string;
  location: string;
  mimeType: string;
}

interface SaveToDownloadsOptions {
  filename: string;
  mimeType: string;
  data: string;
}

interface ExportFileActionOptions {
  uri: string;
  mimeType: string;
}

interface ExportFilePlugin {
  saveToDownloads(options: SaveToDownloadsOptions): Promise<ExportedFile>;
  shareFile(options: ExportFileActionOptions): Promise<void>;
  openFile(options: ExportFileActionOptions): Promise<void>;
}

export const ExportFile = registerPlugin<ExportFilePlugin>('ExportFile');
