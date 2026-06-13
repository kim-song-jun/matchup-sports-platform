/**
 * Minimal local declaration for multer's file object.
 * Full @types/multer is only installed in apps/api.
 * This covers the subset of fields needed by v1_api's uploads module.
 */
export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  /** File size in bytes */
  size: number;
  /** DiskStorage: directory where the file was saved */
  destination: string;
  /** DiskStorage: file name inside `destination` (random hex, no extension) */
  filename: string;
  /** DiskStorage: full path = destination + filename */
  path: string;
}

/**
 * Augment the global Express namespace so @UploadedFiles() typing works
 * without @types/multer being installed.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Multer {
      // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      interface File extends MulterFile {}
    }
  }
}
