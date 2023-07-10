'use strict';

/**
 * Module dependencies
 */

/* eslint-disable no-unused-vars */
// Public node modules.
const _ = require('lodash');
const AWS = require('aws-sdk');

function assertUrlProtocol(url) {
  // Regex to test protocol like "http://", "https://"
  return /^\w*:\/\//.test(url);
}


// provider: "aws-s3",
// providerOptions: {
//   // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property
//   accessKeyId: env("AWS_ACCESS_KEY_ID"),
//   secretAccessKey: env("AWS_SECRET_ACCESS_KEY"),
//   endpoint: env("AWS_ENDPOINT"),
//   cloudflarePublicAccessUrl: env("AWS_CUSTOM_READ_ENDPOINT"),
//   defaultAcl: false,
//   s3UseArnRegion: false,
//   s3BucketEndpoint: false, // Whether the provided endpoint addresses an individual bucket. false if it addresses the root API endpoint
//   s3ForcePathStyle: true, // removes bucket name from Endpoint URL
//   params: {
//     Bucket: env("AWS_BUCKET"),
//   },
// },

module.exports = {
  init(config) {
    const S3 = new AWS.S3({
      apiVersion: '2006-03-01',
      ...config,
    });

    if (!config.cloudflarePublicAccessUrl) {
      process.emitWarning("strapi-provider-cloudflare-r2 requires cloudflarePublicAccessUrl to upload files larger than 5MB. https://github.com/trieb-work/strapi-provider-cloudflare-r2#provider-configuration")
    }

    const upload = (file, customParams = {}) =>
      new Promise((resolve, reject) => {
        // upload file on S3 bucket
        const path = file.path ? `${file.path}/` : '';
        S3.upload(
          {
            Key: `${path}${file.hash}${file.ext}`,
            Body: file.stream || Buffer.from(file.buffer, 'binary'),
            ContentType: file.mime,
            ...customParams,
          },
          (err, data) => {
            if (err) {
              return reject(err);
            }

            // When a file is >5MB, Location is set to "auto" and the bucket name is prepended to the key.

            // Strip bucket name from key if Location is auto
            const key = data.Location === 'auto' && data.Key.startsWith(`${config.params.Bucket}/`)
              ? data.Key.replace(`${config.params.Bucket}/`, '')
              : data.Key;

            // Set the bucket file URL.
            // If there is a custom endpoint for data access set, replace the upload endpoint with the read enpoint URL.
            // Otherwise, use location returned from S3 API if it's not "auto"
            if (config.cloudflarePublicAccessUrl) {
              file.url = config.cloudflarePublicAccessUrl.replace(/\/$/g, '') + '/' + key;
            } else if (data.Location !== 'auto') {
              file.url = data.Location;
            } else {
              throw new Error("Cloudflare S3 API returned no file location and cloudflarePublicAccessUrl is not set. strapi-provider-cloudflare-r2 requires cloudflarePublicAccessUrl to upload files larger than 5MB. https://github.com/trieb-work/strapi-provider-cloudflare-r2#provider-configuration")
            }

            // check if https is included in file URL
            if (!assertUrlProtocol(file.url)) {
              // Default protocol to https protocol
              file.url = `https://${file.url}`;
            }

            resolve();
          }
        );
      });

    return {
      uploadStream(file, customParams = {}) {
        return upload(file, customParams);
      },
      upload(file, customParams = {}) {
        return upload(file, customParams);
      },
      delete(file, customParams = {}) {
        return new Promise((resolve, reject) => {
          // delete file on S3 bucket
          const path = file.path ? `${file.path}/` : '';
          S3.deleteObject(
            {
              Key: `${path}${file.hash}${file.ext}`,
              ...customParams,
            },
            (err, data) => {
              if (err) {
                return reject(err);
              }

              resolve();
            }
          );
        });
      },
    };
  },
};
