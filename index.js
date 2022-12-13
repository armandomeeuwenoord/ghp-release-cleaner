// const releases = require('./releases.json');
const _ = require('lodash');
const fetch = require('node-fetch');
const core = require('@actions/core');
const github = require('@actions/github');
const { isArray } = require('lodash');

new Promise((resolve, reject) => {
    let org = core.getInput('userOrg');
    let auth_token = core.getInput('token');
    let package_name = core.getInput('package');
    let type = core.getInput('type');
    let pattern = core.getInput('pattern');

    let result_packages = [];
    let request = `/orgs/${org}/packages/${type}/${package_name}/versions`;

    send_request(request, 'GET', {
      "per_page": 100
    }, auth_token)
      .then((response) => {
        if (response.statusCode > 399) {
          return reject(new Error(`${response.statusCode}: ${response.json.message}`));
        }

        return response.json;
      })
      .then((response_json) => {
        _.forEach(response_json, (package_entry) => {
          console.log('Package name: ', package_entry.name)

          if (type === 'container') {
            _.forEach(package_entry.metadata, (metadata) => {
              if (isArray(metadata.tags)) {
                _.forEach(metadata.tags, (tag) => {
                  console.log('Checking for machting containers: ', pattern)

                  if (tag.search(pattern) !== -1) {
                    console.log('Found container with tag: ', tag)

                    result_packages.push({
                      "name": package_entry.name,
                      "id": package_entry.id,
                      "tag": tag
                    });
                  }
                });
              }
            })
          } else {
            if (package_entry.metadata.indexOf(pattern) !== -1) {
              result_packages.push({
                "name": package_entry.name,
                "id": package_entry.id
              });
            }
          }
        });

        return delete_packages(result_packages, org, type, package_name, auth_token);
      });
})
.then((packages_deleted) => {
  console.log(`Deleted ${packages_deleted} package versions`);
  core.setOutput("num_deleted", packages_deleted);
})
.catch((error) => {
  console.error(error);
});

function delete_packages(result_packages, org, type, package_name, auth_token) {
  let num_packages = result_packages.length;
  let total_packages_deleted = 0;

  console.log("Total deleting packages: ", num_packages);

  return new Promise((resolve, reject) => {
    _.forEach(result_packages, (package_entry) => {

      console.log('Package deleted with ID:', package_entry.id);

      send_request(`/orgs/${org}/packages/${type}/${package_name}/versions/${package_entry.id}`, 'DELETE', null, auth_token)
        .then((response) => {
          console.log(`Status of request: ${response.statusCode}`);
          total_packages_deleted++;

          if (total_packages_deleted === num_packages) {
            resolve(num_packages);
          }
        })
        .catch((error) => {
          reject(error);
        });
    });
  });
}

function send_request(path, method, body, auth_token) {
  // Pull data from github
  const base_url = "https://api.github.com";
  const accept_header = "application/vnd.github.v3+json";

  const url = new URL(path, base_url);
  console.log(`Making ${method} request to: ${url}`);
  return fetch(url, {
    headers: {
      'Accept': accept_header,
      'Authorization': `token ${auth_token}`
    },
    method: method,
    body: method !== 'GET' && body !== null ? JSON.stringify(body) : null,
  })
    .then((response) => {
      return new Promise((resolve, reject) => {
        if (response.status === 204 || response.body === null) {
          resolve({
            statusCode: response.status,
            body: null
          });

          return;
        }

        response.json()
          .then((resulting_json) => {
            resolve({
              statusCode: response.status,
              json: resulting_json
            });
          });
      });
    });
}
