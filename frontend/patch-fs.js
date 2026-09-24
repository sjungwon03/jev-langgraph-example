const fs = require('fs');

function mapError(err) {
  if (err && (err.code === 'EISDIR' || err.code === 'UNKNOWN')) {
    const newErr = new Error('EINVAL: invalid argument, readlink');
    newErr.code = 'EINVAL';
    newErr.errno = -4071;
    newErr.syscall = 'readlink';
    return newErr;
  }
  return err;
}

const origReadlinkSync = fs.readlinkSync;
fs.readlinkSync = function (...args) {
  try {
    return origReadlinkSync.apply(this, args);
  } catch (err) {
    throw mapError(err);
  }
};

const origReadlink = fs.readlink;
fs.readlink = function (...args) {
  const cb = args[args.length - 1];
  if (typeof cb === 'function') {
    args[args.length - 1] = function (err, linkString) {
      return cb(mapError(err), linkString);
    };
  }
  return origReadlink.apply(this, args);
};

if (fs.promises && fs.promises.readlink) {
  const origPromisesReadlink = fs.promises.readlink;
  fs.promises.readlink = async function (...args) {
    try {
      return await origPromisesReadlink.apply(this, args);
    } catch (err) {
      throw mapError(err);
    }
  };
}
