//@ts-check
const fetch = require("fetch-retry")(require("node-fetch/lib"), {
  retries: 3,
  retryDelay: 2000
});

/** Default title used when one isn't specified for a Pull Request */
const defaultPullRequestTitle = "Tree Push Pull Request";

/** Default value for contentToBlobBytes */
const default_contentToBlobBytes = 50000;

const sha1 = require("sha1");
/*
 * see https://git-scm.com/book/en/v2/Git-Internals-Git-Objects
 *
 * Git generates the SHA by concatenating a header in the form of blob {content.length} {null byte} and the contents of your file
 *
 */
/**
 * Returns a Github equivalent sha hash for any given content
 *
 * @param {string | Buffer} content string or Buffer content to hash
 * @returns SHA Hash that would be used on Github for the given content
 */

const gitHubBlobPredictSha = content =>
  sha1(
    Buffer.concat([
      Buffer.from(`blob ${Buffer.byteLength(content)}\0`, "utf8"),
      Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8")
    ])
  );

/**
 * Halts processing for a set time
 *
 * @param {number} ms milliseconds to sleep (1000 = 1s)
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @typedef {object} TreePushTreeOptions
 * @property {string} owner **Required.** GitHub _owner_ path.
 * @property {string} repo **Required.** GitHub _repo_ path.
 * @property {string} base **Required.** The name of the base branch that the head will be merged into (main/etc).
 * @property {string} [path] Starting path in the repo for changes to start from. Defaults to root.
 * @property {boolean} [removeOtherFiles] `true` to remove other files in the path when pushing.
 * @property {boolean} [recursive] `true` to compare sub-folders too.  Default `true`.
 * @property {number} [contentToBlobBytes] Content bytes allowed in content tree before turning it into a separate blob upload. Default 50000.
 * @property {string} [commit_message] Name to identify the Commit.
 * @property {boolean} [pull_request] `true` to use a Pull Request.
 * @property {TreePushCommitPullRequestOptions} [pull_request_options] Options if using a Pull Request. See https://docs.github.com/en/rest/reference/pulls#create-a-pull-request
 */

/**
 * @typedef {object} GithubTreeRow
 * @property {string} path
 * @property {string} mode usually '100644'
 * @property {string} type usually 'blob'
 * @property {string | null} [sha]
 * @property {string} [content]
 */

/**
 * @typedef {object} GithubCommit
 * @property {string} sha
 * @property {string} html_url
 * @property {string} message
 * @property {{sha:string}[]} [parents]
 */

/**
 * @typedef {object} GithubCompareFile
 * @property {string} filename
 * @property {string} status
 */

/**
 * @typedef {object} GithubCompare
 * @property {GithubCommit} commit
 * @property {GithubCompareFile[]} files
 */

/**
 * From https://docs.github.com/en/rest/reference/pulls#request-reviewers-for-a-pull-request
 *
 * @typedef {object} TreePushCommitPullRequestReviewOptions
 * @property {string[]} [reviewers] An array of user logins that will be requested.
 * @property {string[]} [team_reviewers] An array of team slugs that will be requested.
 */

/**
 * From https://docs.github.com/en/rest/reference/issues#update-an-issue
 *
 * @typedef {object} TreePushCommitPullRequestIssueOptions
 * @property {number} [milestone] The number of the milestone to associate this issue.
 * @property {string[]} [labels] Issue labels to apply to the Pull Request.
 * @property {string[]} [assignees] Logins for Users to assign to this issue.
 */

/**
 * From https://docs.github.com/en/rest/reference/pulls#create-a-pull-request
 *
 * @typedef {object} TreePushCommitPullRequestOptions
 * @property {string} [title] The title of the new pull request. (Leave `issue` blank if you use this)
 * @property {number} [issue] Issue number this pull request replaces (Leave `title` blank if you use this)
 * @property {string} [body] The contents describing the pull request.
 * @property {boolean} [maintainer_can_modify] Indicates whether maintainers can modify the pull request.
 * @property {boolean} [draft] Indicates whether the pull request is a draft.
 * @property {TreePushCommitPullRequestReviewOptions} [review_options] Options for reviewers.
 * @property {TreePushCommitPullRequestIssueOptions} [issue_options] Options for issue.
 * @property {boolean} [automatic_merge] `true` to merge the PR after creating it. Will wait for status checks to pass.
 * @property {number} [automatic_merge_delay] MS to delay after creating before attempting to merge.
 */

/**
 * @typedef {object} TreeFileOperation
 * @property {TreeFileOperationSync} [sync]
 * @property {boolean} [remove]
 */

/**
 * @typedef {object} TreeFileOperationSync
 * @property {string} sha
 * @property {string} [content]
 * @property {Buffer} [buffer]
 */

/**
 * @typedef {object} TreeFileRunStats
 * @property {string} Name Identifies this stat report.
 * @property {number} [Tree_Operations] Number of CRUD operations in the new tree.
 * @property {number} [Content_Converted_To_Blobs] Text content that will be uploaded separately (because of dupes or size).
 * @property {number} [Blobs_Uploaded] Number of blobs uploaded to GitHub just now.
 * @property {number} [Text_Content_Uploaded] Number of text content strings that were uploaded together in the tree.
 * @property {number} [Target_Tree_Size] The original tree size.
 * @property {number} [Files_Deleted] Files deleted from GitHub in this tree.
 * @property {number} [Files_Referenced] Files where a SHA reference to a blob was added/moved.
 * @property {string} [Commit_URL] The GitHub URL for the commit details.
 * @property {string} [Pull_Request_URL] The GitHub URL for the pull request details.
 * @property {number} [GitHub_Rate_Limit_Remaining] How many more requests are allowed this hour.
 * @property {number} [GitHub_Rate_Limit_Retry_After] How long to wait before trying again.
 */

/**
 * @typedef {object} FetchOptions
 * @property {string} [method]
 * @property {FetchOptionsHeaders} [headers]
 */

/**
 * @typedef {object} FetchOptionsHeaders
 * @property {string} [Authorization]
 * @property {string} [Content-Type]
 * @property {string} [User-Agent]
 * @property {string} [Accept]
 * @property {string} [If-None-Match]
 */

/**
 * Manage a tree for syncing with GitHub
 */
class GitHubTreePush {
  /**
   * @param {string} token authentication token
   * @param {TreePushTreeOptions} options describes the target in GitHub
   */
  constructor(token, options) {
    /**
     * (private) All registered files for the tree operation
     *
     * @type {TreePushTreeOptions}
     */
    this.options = options;

    /**
     *  (private) All registered files for the tree operation
     *
     * @type {Map<string,TreeFileOperation>}
     */
    this.__treeOperations = new Map();

    /**
     * Stats from the last operation
     *
     * @type {TreeFileRunStats}
     */
    this.lastRunStats = { Name: "Not run" };

    /**
     * The last commit compare where there was a change
     *
     * @type {GithubCompare | undefined}
     */
    this.lastCompare = undefined;

    /**
     * The last json object returned from the most recent fetch
     *
     * @type {*}
     */
    this.lastJson = undefined;

    /**
     * (private) A list of all the shas we know exist in GitHub
     *
     * @type {Set<string>}
     */
    this.__knownBlobShas = new Set();

    /**
     * Hiding the token unless explicitly asked for
     *
     * @type {function():string}
     */
    this.__token = () => token;

    /**
     * @type {{path:string,url:string}[]}
     */
    this.__downloads = [];

    this.options.recursive = this.options.recursive ?? true; //default to true

    this.options.contentToBlobBytes =
      this.options.contentToBlobBytes ?? default_contentToBlobBytes; //default size
  }

  __gitAuthheader() {
    return {
      Authorization: `Bearer ${this.__token()}`,
      "Content-Type": "application/json",
      "User-Agent": "cagov-github-tree-push",
      Accept: "application/vnd.github.v3+json" //https://docs.github.com/en/rest/overview/resources-in-the-rest-api#current-version
    };
  }

  /**
   *
   * @param {FetchOptions} [options] Options to override the defaults
   */
  __gitDefaultOptions(options) {
    return {
      method: "GET",
      ...options,
      headers: { ...this.__gitAuthheader(), ...options?.headers }
    };
  }

  /**
   *Common function for creating a PUT option
   *
   * @param {*} bodyJSON JSON to PUT
   * @param {FetchOptions} [options]
   */
  __gitPostOptions(bodyJSON, options) {
    return {
      ...this.__gitDefaultOptions(options),
      method: options?.method || "POST",
      body: JSON.stringify(bodyJSON)
    };
  }

  /**
   * Perform an authenticated GET to an API path
   *
   * @param {string} path
   * @param {FetchOptions} [options]
   * @param {number[]} [okStatusCodes]
   */
  async __getSomeJson(path, options, okStatusCodes) {
    return this.__fetchJSON(
      path,
      this.__gitDefaultOptions(options),
      okStatusCodes
    );
  }

  /**
   * Perform an authenticated GET to an API path
   *
   * @param {string} path
   * @param {*} body
   * @param {FetchOptions} [options]
   * @param {number[]} [okStatusCodes]
   */
  async __postSomeJson(path, body, options, okStatusCodes) {
    return this.__fetchJSON(
      path,
      this.__gitPostOptions(body, options),
      okStatusCodes
    );
  }

  /**
   * fetch a url with options, return a response (Wrapper for fetch)
   *
   * @param {string} path
   * @param {FetchOptions} [options]
   * @param {number[]} [okStatusCodes]
   */
  async __fetchResponse(path, options, okStatusCodes) {
    const apiURL = `https://api.github.com/repos/${this.options.owner}/${this.options.repo}${path}`;

    //All these request have required auth
    if (!options?.headers?.Authorization) {
      throw new Error("Authorization Header Required");
    }
    return fetch(apiURL, options).then(async response => {
      this.lastFetchResponse = response;
      this.lastRunStats.GitHub_Rate_Limit_Remaining = Number(
        this.lastFetchResponse.headers.get("x-ratelimit-remaining")
      );

      const retryAfter = this.lastFetchResponse.headers.get("Retry-After");
      if (retryAfter) {
        this.lastRunStats.GitHub_Rate_Limit_Retry_After = Number(retryAfter);
      }

      if (!response.ok && !okStatusCodes?.includes(response.status)) {
        const body = await response.text();

        throw new Error(
          `${response.status} - ${response.statusText} - ${response.url} - ${body}`
        );
      }

      return response;
    });
  }

  /**
   * fetch a url and return json
   *
   * @param {string} path
   * @param {FetchOptions} [options]
   * @param {number[]} [okStatusCodes]
   */
  async __fetchJSON(path, options, okStatusCodes) {
    const response = await this.__fetchResponse(path, options, okStatusCodes);

    const contentType = response.headers.get("content-type");

    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      if (!text.length) return null;

      throw new Error(
        `Non-JSON content type - ${contentType}\n\nContent...\n\n${text}`
      );
    }

    const json = await response.json();

    this.lastJson = json;

    return json;
  }

  /**
   * Get the tree from the remote repository
   */
  async __readTree() {
    const outputPath = this.options.path;
    const masterBranch = this.options.base;

    let treeUrl = "";
    if (outputPath) {
      //Path Tree

      const pathRootTree = outputPath.split("/").slice(0, -1).join("/"); //gets the parent folder to the output path
      /** @type {GithubTreeRow[]} */
      const rootTree = await this.__getSomeJson(
        `/contents/${pathRootTree}?ref=${masterBranch}` //https://docs.github.com/en/rest/reference/repos#contents
      );

      const referenceTreeRow = rootTree.find(f => f.path === outputPath);

      if (referenceTreeRow?.sha) {
        treeUrl = referenceTreeRow.sha;
      }
    } else {
      //Root Tree
      treeUrl = masterBranch;
    }

    if (treeUrl) {
      const recursiveOption = this.options.recursive ? "?recursive=true" : "";

      //https://docs.github.com/en/rest/reference/git#get-a-tree
      //update the referenceTree to match the remote tree

      /** @type {{sha:string,truncated:boolean,tree:GithubTreeRow[]}}} */
      const treeResult = await this.__getSomeJson(
        `/git/trees/${treeUrl}${recursiveOption}`
      );
      if (treeResult.truncated) {
        throw new Error("Tree is too big to compare.  Use a sub-folder.");
      }
      const referenceTree = treeResult.tree.filter(x => x.type === "blob");

      this.lastRunStats.Target_Tree_Size = referenceTree.length;

      //Add all the known shas to a list
      referenceTree
        .map(x => x.sha)
        .forEach(x => {
          if (x) {
            this.__knownBlobShas.add(x);
          }
        });

      return referenceTree;
    } else {
      //empty tree
      return [];
    }
  }

  /**
   * returns an update tree that for files in the fileMap that are changed from the referenceTree
   *
   * @param {GithubTreeRow[]} existingFilesTree
   */
  __deltaTree(existingFilesTree) {
    const outputPath = this.options.path;

    //process auto deletes
    if (this.options.removeOtherFiles) {
      existingFilesTree
        .map(f => f.path)
        .filter(path => !this.__treeOperations.has(path))
        .forEach(path => {
          this.removeFile(path);
        });
    }

    /** @type {GithubTreeRow[]} */
    const targetTree = [];

    for (const [opPath, operation] of this.__treeOperations) {
      let existingFile = existingFilesTree.find(x => x.path === opPath);

      //Tree parts...
      //https://docs.github.com/en/free-pro-team@latest/rest/reference/git#create-a-tree
      /** @type {GithubTreeRow} */
      let treeRow = {
        path: outputPath ? `${outputPath}/${opPath}` : opPath,
        mode: "100644", //code for tree blob,
        type: "blob"
      };

      if (operation.sync) {
        //Add / Update

        if (existingFile?.sha !== operation.sync.sha) {
          //Change detected (Add or Update)

          if (
            operation.sync.content &&
            !this.__knownBlobShas.has(operation.sync.sha)
          ) {
            treeRow.content = operation.sync.content;
          } else {
            treeRow.sha = operation.sync.sha;
          }

          targetTree.push(treeRow);
        }
      } else if (existingFile && operation.remove) {
        //Specific removal request of existing file

        treeRow.sha = null; //will trigger a delete

        targetTree.push(treeRow);
      }
    } // looping through __treeOperations

    return targetTree;
  }

  /**
   *  Return a commit with all the tree changes
   *
   * @param {GithubTreeRow[]} tree from createTreeFromFileMap
   * @param {string} [commit_message] optional commit message
   */
  async __createCommitFromTree(tree, commit_message) {
    if (!tree.length) {
      return null;
    }

    const targetBranch = this.options.base;

    let treeParts = [tree];
    const totalRows = tree.length;

    console.log(
      `Total tree size is ${Buffer.byteLength(JSON.stringify(tree))} bytes`
    );

    this.lastRunStats.Tree_Operations = tree.length;

    //Split the tree into allowable sizes
    let evalIndex = 0;
    while (evalIndex < treeParts.length) {
      if (JSON.stringify(treeParts[evalIndex]).length > 9000000) {
        let half = Math.ceil(treeParts[evalIndex].length / 2);
        treeParts.unshift(treeParts[evalIndex].splice(0, half));
      } else {
        evalIndex++;
      }
    }

    //Grab the starting point for a fresh tree
    /** @type {{object:{sha:string}}} */
    const refResult = await this.__getSomeJson(
      `/git/refs/heads/${targetBranch}`
    );

    const baseSha = refResult.object.sha;

    //Loop through adding items to the tree
    let createTreeResult = { sha: baseSha };
    let rowCount = 0;
    for (let treePart of treeParts) {
      rowCount += treePart.length;
      console.log(`Creating tree - ${rowCount}/${totalRows} items`);

      createTreeResult = await this.__postSomeJson("/git/trees", {
        tree: treePart,
        base_tree: createTreeResult.sha
      });
    }

    //Create a commit the maps to all the tree changes
    /** @type {GithubCommit} */
    const commitResult = await this.__postSomeJson("/git/commits", {
      parents: [baseSha],
      tree: createTreeResult.sha,
      message: commit_message || ""
    });

    //Add all the new content shas to the list
    tree
      .map(x => x.content)
      .forEach(x => {
        if (x) {
          this.lastRunStats.Text_Content_Uploaded =
            (this.lastRunStats.Text_Content_Uploaded || 0) + 1;
          this.__knownBlobShas.add(gitHubBlobPredictSha(x));
        }
      });

    tree
      .map(x => x.sha)
      .filter(x => x === null)
      .forEach(() => {
        this.lastRunStats.Files_Deleted =
          (this.lastRunStats.Files_Deleted || 0) + 1;
      });

    tree
      .map(x => x.sha)
      .filter(x => x)
      .forEach(() => {
        this.lastRunStats.Files_Referenced =
          (this.lastRunStats.Files_Referenced || 0) + 1;
      });

    this.lastRunStats.Commit_URL = commitResult.html_url;

    return commitResult;
  }

  /**
   * Creates a GitHub compare
   *
   * @param {GithubCommit} commit
   * @returns {Promise<GithubCompare | null>}
   */
  async __compareCommit(commit) {
    if (!commit?.parents) {
      return null;
    }
    const baseSha = commit.parents[0].sha;
    const commitSha = commit.sha;

    //https://docs.github.com/en/rest/reference/repos#compare-two-commits
    //Compare the proposed commit with the trunk (master) branch
    const compare = await this.__getSomeJson(
      `/compare/${baseSha}...${commitSha}`
    );

    /** @type {*[]} */
    const commitsArray = compare.commits;

    if (commitsArray.length) {
      //pull in some common commit info
      compare.commit = commitsArray[0];
      compare.commit.message = compare.commit.commit.message;
    }

    return compare;
  }

  /**
   * Sets a single file to the tree to be syncronized (updated or added).
   *
   * @param {string} path Path to use for publishing file
   * @param {*} content Content to use for the file.
   */
  syncFile(path, content) {
    /** @type {TreeFileOperationSync} */
    let sync = { sha: "" };

    if (Buffer.isBuffer(content)) {
      sync.buffer = content;
      sync.sha = gitHubBlobPredictSha(sync.buffer);
    } else {
      sync.content =
        typeof content === "string"
          ? content
          : JSON.stringify(content, null, 2);
      sync.sha = gitHubBlobPredictSha(sync.content);
    }

    this.__treeOperations.set(path, { sync });
  }

  /**
   * Sets a file to not be removed when `removeOtherFiles:true`.
   *
   * @param {string} path path of file to be preserved.
   */
  doNotRemoveFile(path) {
    this.__treeOperations.set(path, { remove: false });
  }

  /**
   * Sets a file to removed.
   *
   * @param {string} path Path of file to be removed.
   */
  removeFile(path) {
    this.__treeOperations.set(path, { remove: true });
  }

  /**
   * Adds a download URL to be obtained asyronously before the push happens
   *
   * @param {string} path Path to use for publishing file
   * @param {string} url url for the object to download
   */
  syncDownload(path, url) {
    this.__downloads.push({ path, url });
  }

  /**
   * Based on the current file map, upload blobs, including duplicate content and large content
   */
  async __syncBlobs() {
    //Turn duplicate content into buffers
    const fileMapValues = [...this.__treeOperations.values()];

    const blobPromises = [];

    //Push Buffers
    for (const value of fileMapValues) {
      if (value.sync) {
        if (!this.__knownBlobShas.has(value.sync.sha)) {
          if (value.sync.content) {
            //If the content is duplicate, or too large, use a buffer
            if (
              Buffer.byteLength(value.sync.content, "utf8") >
              (this.options?.contentToBlobBytes ??
                fileMapValues.filter(x => x.sync?.sha === value.sync?.sha)
                  .length > 1) //2 or more found
            ) {
              //content converted to blobs
              this.lastRunStats.Content_Converted_To_Blobs =
                (this.lastRunStats.Content_Converted_To_Blobs || 0) + 1;
              value.sync.buffer = Buffer.from(value.sync.content);
              delete value.sync.content;
            }
          }

          //If buffer and the sha is not already confirmed uploaded, check it and upload.
          if (value.sync.buffer) {
            blobPromises.push(
              this.__putBlobInRepo(value.sync.sha, value.sync.buffer)
            );
            this.__knownBlobShas.add(value.sync.sha);
          }
        }
      }
    }

    if (blobPromises.length) {
      console.log(`Syncing ${blobPromises.length} blobs`);
      await Promise.all(blobPromises);
    }
  }

  /**
   * Makes sure the blob is in the repo
   *
   * @param {string} sha
   * @param {Buffer} buffer
   */
  async __putBlobInRepo(sha, buffer) {
    return this.__fetchResponse(
      //https://docs.github.com/en/rest/reference/git#get-a-blob
      `/git/blobs/${sha}`,
      this.__gitDefaultOptions({ method: "HEAD" }),
      [404]
    ).then(async headResult => {
      let logNote = "Found...";
      if (headResult.status === 404) {
        logNote = "Uploading...";

        //https://docs.github.com/en/rest/reference/git#blobs
        await this.__postSomeJson("/git/blobs", {
          content: buffer.toString("base64"),
          encoding: "base64"
        });

        this.lastRunStats.Blobs_Uploaded =
          (this.lastRunStats.Blobs_Uploaded || 0) + 1;
      }

      //List all the files being uploaded/matched
      [...this.__treeOperations]
        .filter(([, value]) => value.sync?.sha === sha)
        .forEach(([key]) => console.log(logNote + key));
    });
  }

  /**
   * @typedef {object} PrStatus
   * @property {number} number
   * @property {boolean} mergeable
   * @property {string} mergeable_state
   * @property {string} state
   * @property {boolean} draft
   * @property {string} etag
   * @property {number} status
   */

  /**
   * Internal function used for polling Pr Status
   *
   * @param {number} prnumber
   * @param {PrStatus} [originalData]
   */
  async __getPrStatus(prnumber, originalData) {
    const header = originalData?.etag
      ? {
          headers: { "If-None-Match": originalData.etag }
        }
      : undefined;

    //https://docs.github.com/en/rest/reference/pulls#get-a-pull-request
    /** @type {PrStatus} */
    const jsonResult = await this.__getSomeJson(`/pulls/${prnumber}`, header, [
      304
    ]);

    const status = this.lastFetchResponse?.status;
    const etag = this.lastFetchResponse?.headers.get("etag");

    //https://docs.github.com/en/rest/overview/resources-in-the-rest-api#conditional-requests
    return /** @type {PrStatus} */ (
      jsonResult
        ? {
            ...jsonResult,
            status,
            etag
          }
        : { ...originalData, status }
    );
  }

  /**
   * @typedef {object} PrCheckStatus
   * @property {{status:string,conclusion:string,html_url:string}[]} check_runs
   * @property {string} etag
   * @property {number} status
   */

  /**
   * Internal function used for polling Pr CHECK Status
   *
   * @param {string} commitsha
   * @param {PrCheckStatus} [originalData]
   */
  async __getPrCheckStatus(commitsha, originalData) {
    const header = originalData?.etag
      ? {
          headers: { "If-None-Match": originalData.etag }
        }
      : undefined;

    //https://docs.github.com/en/rest/reference/checks#list-check-runs-for-a-git-reference
    /** @type {PrCheckStatus} */
    const jsonResult = await this.__getSomeJson(
      `/commits/${commitsha}/check-runs`,
      header,
      [304]
    );

    const status = this.lastFetchResponse?.status;
    const etag = this.lastFetchResponse?.headers.get("etag");

    //https://docs.github.com/en/rest/overview/resources-in-the-rest-api#conditional-requests

    return /** @type {PrCheckStatus} */ (
      jsonResult
        ? {
            ...jsonResult,
            status,
            etag
          }
        : { ...originalData, status }
    );
  }

  /**
   * async download of any requested urls
   */
  async __getDownloads() {
    if (this.__downloads.length) {
      /** @type {Map<string,Buffer>} */
      const downloadResults = new Map();

      const urls = [...new Set(this.__downloads.map(dl => dl.url))];

      console.log(`Downloading ${urls.length} file(s)...\n${urls.join("\n")}`);

      /**
       * @param {string} url
       */
      const __syncdownloadGetPromise = async url =>
        fetch(url)
          .then(fetchResponse => fetchResponse.arrayBuffer())
          .then(blob => {
            const buffer = Buffer.from(blob);
            downloadResults.set(url, buffer);
          });

      /** @type {Promise<void>[]} */
      const promises = urls.map(url => __syncdownloadGetPromise(url));

      await Promise.all(promises);

      console.log(`All downloads complete.`);

      this.__downloads.forEach(dl => {
        this.syncFile(dl.path, downloadResults.get(dl.url));
      });
    }
  }

  /**
   * Returns a list of paths that will be changed if this is run
   */
  async treePushDryRun() {
    this.lastRunStats = {
      Name: `treePushDryRun - ${
        this.options.commit_message || "(No commit message)"
      }`
    };

    const referenceTree = await this.__readTree();

    const updatetree = this.__deltaTree(referenceTree);

    return updatetree.map(x => x.path);
  }

  /**
   * Push all the files added to the tree to the repository
   */
  async treePush() {
    this.lastRunStats = {
      Name: `treePush - ${this.options.commit_message || "(No commit message)"}`
    };

    await this.__getDownloads();

    const referenceTree = await this.__readTree();

    await this.__syncBlobs();

    const updatetree = this.__deltaTree(referenceTree);

    const commit = await this.__createCommitFromTree(
      updatetree,
      this.options.commit_message
    );

    if (!commit) {
      console.log(`${this.lastRunStats.Name} - No Changes.`);
    } else {
      const compare = await this.__compareCommit(commit);

      if (compare?.files.length) {
        //Changes to apply
        this.lastCompare = compare;

        console.log(`${compare.commit.message} - ${compare.commit.html_url}`);

        if (this.options.pull_request) {
          //Pull Request Mode
          const newBranchName = `${this.options.base}-${commit.sha}`;

          const pull_request_options = { ...this.options.pull_request_options };

          //https://docs.github.com/en/rest/reference/pulls#request-reviewers-for-a-pull-request
          const review_options = pull_request_options.review_options;
          delete pull_request_options.review_options;

          //https://docs.github.com/en/rest/reference/issues#update-an-issue
          const issue_options = pull_request_options.issue_options;
          delete pull_request_options.issue_options;

          const auto_merge = pull_request_options.automatic_merge;
          delete pull_request_options.automatic_merge;
          const auto_merge_delay = pull_request_options.automatic_merge_delay;
          delete pull_request_options.automatic_merge_delay;

          //https://docs.github.com/en/rest/reference/git#create-a-reference
          await this.__postSomeJson("/git/refs", {
            sha: commit.sha,
            ref: `refs/heads/${newBranchName}`
          });

          const prOptions = {
            head: newBranchName,
            base: this.options.base,
            ...pull_request_options
          };

          if (!prOptions.title && !prOptions.issue) {
            prOptions.title = defaultPullRequestTitle;
          }

          //https://docs.github.com/en/rest/reference/pulls#create-a-pull-request
          /** @type {{number:number,head:{ref:string},html_url:string}} */
          const prResult = await this.__postSomeJson("/pulls", prOptions);

          if (issue_options) {
            //https://docs.github.com/en/rest/reference/issues#update-an-issue
            await this.__postSomeJson(
              `/issues/${prResult.number}`,
              issue_options,
              {
                method: "PATCH"
              }
            );
          }

          if (review_options) {
            //https://docs.github.com/en/rest/reference/pulls#request-reviewers-for-a-pull-request
            await this.__postSomeJson(
              `/pulls/${prResult.number}/requested_reviewers`,
              review_options
            );
          }

          if (auto_merge) {
            if (auto_merge_delay) {
              console.log(`Waiting ${auto_merge_delay}ms before merging PR...`);
              await sleep(auto_merge_delay);
            }
            let checkStatus = await this.__getPrCheckStatus(commit.sha);
            let prStatus = await this.__getPrStatus(prResult.number);

            let waitAttemps = 0;

            while (
              prStatus.mergeable_state === "unknown" ||
              (["blocked", "unstable"].includes(prStatus.mergeable_state) &&
                checkStatus.check_runs.some(x => x.status !== "completed"))
            ) {
              // If the mergable state is unknown, or it is blocked with incomplete checks
              // Unknown mergable state happens for a few seconds after the PR is created
              // "unstable" is when there are no blocking checks, but checks are running.  "blocked" is when blocking checks are running.

              console.log(
                `Waiting for merge, checks = ${checkStatus.check_runs.length}. mergable = ${prStatus.mergeable}, prstatus = ${prStatus.status}, checkstatus = ${checkStatus.status}, mergeable_state = ${prStatus.mergeable_state}`
              );

              await sleep(1000);

              prStatus = await this.__getPrStatus(prResult.number, prStatus);

              checkStatus = await this.__getPrCheckStatus(
                commit.sha,
                checkStatus
              );

              const failedCheck = checkStatus.check_runs.find(
                x => x.conclusion === "failure"
              );

              if (failedCheck) {
                throw new Error(
                  `Auto Merge Check run failed - ${failedCheck.html_url}`
                );
              }

              waitAttemps++;
              if (waitAttemps > 100) {
                throw new Error(
                  `Auto Merge waited too long - ${prResult.html_url}`
                );
              }
            }

            console.log(
              `Done Waiting, checks = ${checkStatus.check_runs.length}. mergable = ${prStatus.mergeable}, prstatus = ${prStatus.status}, checkstatus = ${checkStatus.status}, mergeable_state = ${prStatus.mergeable_state}`
            );

            //https://docs.github.com/en/rest/reference/pulls#merge-a-pull-request
            await this.__postSomeJson(
              `/pulls/${prResult.number}/merge`,
              { merge_method: "squash" },
              {
                method: "PUT"
              }
            );

            //Check before deleting (In case of auto-delete)
            const headResult = await this.__fetchResponse(
              `/git/refs/heads/${prResult.head.ref}`,
              this.__gitDefaultOptions({ method: "HEAD" }),
              [404]
            );

            if (headResult.ok) {
              //https://docs.github.com/en/rest/reference/git#delete-a-reference
              await this.__fetchResponse(
                `/git/refs/heads/${prResult.head.ref}`,
                this.__gitDefaultOptions({ method: "DELETE" })
              );
            }
          }
          this.lastRunStats.Pull_Request_URL = prResult.html_url;
        } else {
          //Just a simple commit on this branch
          //https://docs.github.com/en/rest/reference/git#update-a-reference
          await this.__postSomeJson(
            `/git/refs/heads/${this.options.base}`,
            {
              sha: commit.sha
            },
            { method: "PATCH" }
          );
        }
      }
    }

    return this.lastRunStats;
  }
}

module.exports = { GitHubTreePush };
