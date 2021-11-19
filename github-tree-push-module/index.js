//@ts-check
const fetch = require("fetch-retry")(require("node-fetch/lib"), {
  retries: 3,
  retryDelay: 2000
});

/**
 * Default title used when one isn't specified for a Pull Request
 */
const defaultPullRequestTitle = "Tree Push Pull Request";

const sha1 = require("sha1");
/**
 * Returns a Github equivalent sha hash for any given content
 * see https://git-scm.com/book/en/v2/Git-Internals-Git-Objects
 *
 * Git generates the SHA by concatenating a header in the form of blob {content.length} {null byte} and the contents of your file
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
 * @property {boolean} [deleteOtherFiles] `true` to delete other files in the path when pushing.
 * @property {boolean} [recursive] `true` to compare sub-folders too.
 * @property {number} [contentToBlobBytes] Content bytes allowed in content tree before turning it into a separate blob upload. Default 1000.
 * @property {string} [commit_message] Name to identify the Commit.
 * @property {boolean} [pull_request] `true` to use a Pull Request.
 * @property {TreePushCommitPullRequestOptions} [pull_request_options] Options if using a Pull Request. See https://docs.github.com/en/rest/reference/pulls#create-a-pull-request
 */

/**
 * @typedef {object} GithubTreeRow
 * @property {string} path
 * @property {string} mode usually '100644'
 * @property {string} type usually 'blob'
 * @property {string} [sha]
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
 * From https://docs.github.com/en/rest/reference/pulls#request-reviewers-for-a-pull-request
 * @typedef {object} TreePushCommitPullRequestReviewOptions
 * @property {string[]} [reviewers] An array of user logins that will be requested.
 * @property {string[]} [team_reviewers] An array of team slugs that will be requested.
 */

/**
 * From https://docs.github.com/en/rest/reference/issues#update-an-issue
 * @typedef {object} TreePushCommitPullRequestIssueOptions
 * @property {number} [milestone] The number of the milestone to associate this issue.
 * @property {string[]} [labels] Issue labels to apply to the Pull Request.
 * @property {string[]} [assignees] Logins for Users to assign to this issue.
 */

/**
 * From https://docs.github.com/en/rest/reference/pulls#create-a-pull-request
 * @typedef {object} TreePushCommitPullRequestOptions
 * @property {string} [title] The title of the new pull request. (Leave `issue` blank if you use this)
 * @property {number} [issue] Issue number this pull request replaces (Leave `title` blank if you use this)
 * @property {string} [body] The contents describing the pull request.
 * @property {number} [automatic_merge_delay] MS to delay after creating before attempting to merge.
 * @property {boolean} [maintainer_can_modify] Indicates whether maintainers can modify the pull request.
 * @property {boolean} [draft] Indicates whether the pull request is a draft.
 * @property {TreePushCommitPullRequestReviewOptions} [review_options] Options for reviewers.
 * @property {TreePushCommitPullRequestIssueOptions} [issue_options] Options for issue.
 * @property {boolean} [automatic_merge] `true` to merge the PR after creating it. Will wait for status checks to pass.
 * @property {number} [automatic_merge_delay] MS to delay after creating before attempting to merge.
 */

/**
 * @typedef {object} TreeFileObject
 * @property {string} sha
 * @property {string} [content]
 * @property {Buffer} [buffer]
 */

/**
 * @typedef {object} TreeFileRunStats
 * @property {string} Name Identifies this stat report
 * @property {number} [Tree_Operations] Number of CRUD operations in the new tree
 * @property {number} [Content_Converted_To_Blobs] Text content that will be uploaded separately (because of dupes or size)
 * @property {number} [Blobs_Uploaded] Number of blobs uploaded to GitHub just now
 * @property {number} [Text_Content_Uploaded] Number of text content strings that were uploaded together in the tree
 * @property {number} [Target_Tree_Size] The original tree size
 * @property {number} [Files_Deleted] Files deleted from GitHub in this tree
 * @property {number} [Files_Referenced] Files where a sha reference to a blob was added/moved
 * @property {string} [Commit_URL] The GitHub URL for the commit details
 * @property {string} [Pull_Request_URL] The GitHub URL for the pull request details
 * @property {number} [GitHub_Rate_Limit_Remaining] How many more requests are allowed this hour
 * @property {number} [GitHub_Rate_Limit_Retry_After] How long to wait before trying again
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
  options;

  /** @type {Map<string,TreeFileObject>} */
  #fileMap = new Map();

  /**
   * Stats from the last operation
   * @type {TreeFileRunStats}
   */
  lastRunStats;

  /**
   * A list of all the shas we know exist in GitHub
   * @type {Set<string>}
   */
  #knownBlobShas = new Set();

  /**
   * The last json object returned from the most recent fetch
   * @type {*}
   */
  lastJson;

  /**
   * @param {string} token authentication token
   * @param {TreePushTreeOptions} options describes the target in GitHub
   */
  constructor(token, options) {
    this.options = options;

    /**
     * Hiding the token unless explicitly asked for
     */
    this.getToken = () => token;

    if (typeof this.options.recursive === "undefined") {
      this.options.recursive = true; //default to true
    }
    if (typeof this.options.contentToBlobBytes === "undefined") {
      this.options.contentToBlobBytes = 1000; //default to 1000
    }
  }

  _gitAuthheader() {
    return {
      Authorization: `Bearer ${this.getToken()}`,
      "Content-Type": "application/json",
      "User-Agent": "cagov-github-tree-push",
      Accept: "application/vnd.github.v3+json" //https://docs.github.com/en/rest/overview/resources-in-the-rest-api#current-version
    };
  }

  /**
   *
   * @param {FetchOptions} [options] Options to override the defaults
   */
  _gitDefaultOptions(options) {
    return {
      method: "GET",
      ...options,
      headers: { ...this._gitAuthheader(), ...options?.headers }
    };
  }

  /**
   *Common function for creating a PUT option
   * @param {*} bodyJSON JSON to PUT
   * @param {FetchOptions} [options]
   */
  _gitPostOptions(bodyJSON, options) {
    return {
      ...this._gitDefaultOptions(options),
      method: options?.method || "POST",
      body: JSON.stringify(bodyJSON)
    };
  }

  /**
   * Perform an authenticated GET to an API path
   * @param {string} path
   * @param {FetchOptions} [options]
   * @param {number[]} [okStatusCodes]
   */
  async _getSomeJson(path, options, okStatusCodes) {
    return this._fetchJSON(
      path,
      this._gitDefaultOptions(options),
      okStatusCodes
    );
  }

  /**
   * Perform an authenticated GET to an API path
   * @param {string} path
   * @param {*} body
   * @param {FetchOptions} [options]
   * @param {number[]} [okStatusCodes]
   */
  async _postSomeJson(path, body, options, okStatusCodes) {
    return this._fetchJSON(
      path,
      this._gitPostOptions(body, options),
      okStatusCodes
    );
  }

  /**
   * fetch a url with options, return a response (Wrapper for fetch)
   * @param {string} path
   * @param {FetchOptions} [options]
   * @param {number[]} [okStatusCodes]
   */
  async _fetchResponse(path, options, okStatusCodes) {
    const apiURL = `https://api.github.com/repos/${this.options.owner}/${this.options.repo}${path}`;

    //All these request have required auth
    if (!options.headers?.Authorization) {
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
   * @param {string} path
   * @param {FetchOptions} [options]
   * @param {number[]} [okStatusCodes]
   */
  async _fetchJSON(path, options, okStatusCodes) {
    const response = await this._fetchResponse(path, options, okStatusCodes);

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
  async _readTree() {
    const outputPath = this.options.path;
    const masterBranch = this.options.base;

    let treeUrl = "";
    if (outputPath) {
      //Path Tree

      const pathRootTree = outputPath.split("/").slice(0, -1).join("/"); //gets the parent folder to the output path
      /** @type {GithubTreeRow[]} */
      const rootTree = await this._getSomeJson(
        `/contents/${pathRootTree}?ref=${masterBranch}` //https://docs.github.com/en/rest/reference/repos#contents
      );

      const referenceTreeRow = rootTree.find(f => f.path === outputPath);

      if (referenceTreeRow) {
        treeUrl = referenceTreeRow.sha;
      }
    } else {
      //Root Tree
      treeUrl = masterBranch;
    }

    const recursiveOption = this.options.recursive ? "?recursive=true" : "";

    //https://docs.github.com/en/rest/reference/git#get-a-tree
    //update the referenceTree to match the remote tree

    /** @type {{sha:string,truncated:boolean,tree:GithubTreeRow[]}}} */
    const treeResult = await this._getSomeJson(
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
      .filter(x => x)
      .forEach(x => {
        this.#knownBlobShas.add(x);
      });

    return referenceTree;
  }

  /**
   * returns an update tree that for files in the fileMap that are changed from the referenceTree
   * @param {GithubTreeRow[]} referenceTree
   */
  _deltaTree(referenceTree) {
    const outputPath = this.options.path;

    /** @type {GithubTreeRow[]} */
    const targetTree = [];
    //Tree parts...
    //https://docs.github.com/en/free-pro-team@latest/rest/reference/git#create-a-tree
    const mode = "100644"; //code for tree blob
    const type = "blob";

    for (const [key, value] of this.#fileMap) {
      let existingFile = referenceTree.find(x => x.path === key);

      if (value) {
        //ignoring files with null value

        if (!existingFile || existingFile.sha !== value.sha) {
          let path = outputPath ? `${outputPath}/${key}` : key;

          const treeRow = {
            path,
            mode,
            type
          };

          if (value.content && !this.#knownBlobShas.has(value.sha)) {
            treeRow.content = value.content;
          } else if (value.sha) {
            treeRow.sha = value.sha;
          }

          targetTree.push(treeRow);
        }
      }
    }

    if (this.options.deleteOtherFiles) {
      //process deletes
      for (const delme of referenceTree.filter(
        x => !this.#fileMap.has(x.path)
      )) {
        let path = outputPath ? `${outputPath}/${delme.path}` : delme.path;

        targetTree.push({
          path,
          mode,
          type,
          sha: null //will trigger a delete
        });
      }
    }

    return targetTree;
  }

  /**
   *  Return a commit with all the tree changes
   *
   * @param {GithubTreeRow[]} tree from createTreeFromFileMap
   * @param {string} [commit_message] optional commit message
   */
  async _createCommitFromTree(tree, commit_message) {
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
    const refResult = await this._getSomeJson(
      `/git/refs/heads/${targetBranch}`
    );

    const baseSha = refResult.object.sha;

    //Loop through adding items to the tree
    let createTreeResult = { sha: baseSha };
    let rowCount = 0;
    for (let treePart of treeParts) {
      rowCount += treePart.length;
      console.log(`Creating tree - ${rowCount}/${totalRows} items`);

      createTreeResult = await this._postSomeJson("/git/trees", {
        tree: treePart,
        base_tree: createTreeResult.sha
      });
    }

    //Create a commit the maps to all the tree changes
    /** @type {GithubCommit} */
    const commitResult = await this._postSomeJson("/git/commits", {
      parents: [baseSha],
      tree: createTreeResult.sha,
      message: commit_message || ""
    });

    //Add all the new content shas to the list
    tree
      .map(x => x.content)
      .filter(x => x)
      .forEach(x => {
        this.lastRunStats.Text_Content_Uploaded =
          (this.lastRunStats.Text_Content_Uploaded || 0) + 1;
        this.#knownBlobShas.add(gitHubBlobPredictSha(x));
      });

    tree
      .map(x => x.sha)
      .filter(x => x === null)
      .forEach(x => {
        this.lastRunStats.Files_Deleted =
          (this.lastRunStats.Files_Deleted || 0) + 1;
      });

    tree
      .map(x => x.sha)
      .filter(x => x)
      .forEach(x => {
        this.lastRunStats.Files_Referenced =
          (this.lastRunStats.Files_Referenced || 0) + 1;
      });

    this.lastRunStats.Commit_URL = commitResult.html_url;

    return commitResult;
  }

  /**
   * Creates a GitHub compare
   * @param {GithubCommit} commit
   */
  async _compareCommit(commit) {
    if (!commit) {
      return null;
    }
    const baseSha = commit.parents[0].sha;
    const commitSha = commit.sha;

    //https://docs.github.com/en/rest/reference/repos#compare-two-commits
    //Compare the proposed commit with the trunk (master) branch
    /** @type {{commits:{commmit:GithubCommit}[],files:GithubCompareFile[]}} */
    const compare = await this._getSomeJson(
      `/compare/${baseSha}...${commitSha}`
    );

    return compare;
  }

  /**
   * Add a single file to the tree
   * @param {string} path path to use for publishing file
   * @param {string | Buffer} value content to use
   */
  addFile(path, value) {
    const content =
      typeof value === "string"
        ? value
        : Buffer.isBuffer(value)
        ? null
        : JSON.stringify(value, null, 2);

    const buffer = Buffer.isBuffer(value) ? value : null;

    const sha = gitHubBlobPredictSha(content || buffer);

    /** @type {TreeFileObject} */
    const newFile = { sha, content, buffer };

    this.#fileMap.set(path, newFile);
  }

  /**
   * Sets a file to be ignored
   * @param {string} path path to use for ignored file
   */
  ignoreFile(path) {
    this.#fileMap.set(path, null);
  }

  /**
   * Adds a list of files to the tree
   * @param {Map<string,string | Buffer>} newFileMap
   */
  addFileMap(newFileMap) {
    for (const [path, value] of newFileMap) {
      this.addFile(path, value);
    }
  }

  /**
   * Based on the current file map, upload blobs, including duplicate content and large content
   */
  async _syncBlobs() {
    //Turn duplicate content into buffers
    const fileMapValues = [...this.#fileMap.values()];

    const blobPromises = [];

    //Push Buffers
    for (const value of fileMapValues) {
      if (!this.#knownBlobShas.has(value.sha)) {
        if (value.content) {
          //If the content is duplicate, or too large, use a buffer
          if (
            Buffer.byteLength(value.content, "utf8") >
              this.options.contentToBlobBytes ||
            fileMapValues.filter(x => x.sha === value.sha).length > 1 //2 or more found
          ) {
            //content converted to blobs
            this.lastRunStats.Content_Converted_To_Blobs =
              (this.lastRunStats.Content_Converted_To_Blobs || 0) + 1;
            value.buffer = Buffer.from(value.content);
            value.content = null;
          }
        }

        //If buffer and the sha is not already confirmed uploaded, check it and upload.
        if (value.buffer) {
          blobPromises.push(this._putBlobInRepo(value.sha, value.buffer));
          this.#knownBlobShas.add(value.sha);
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
   * @param {string} sha
   * @param {Buffer} buffer
   */
  async _putBlobInRepo(sha, buffer) {
    return this._fetchResponse(
      //https://docs.github.com/en/rest/reference/git#get-a-blob
      `/git/blobs/${sha}`,
      this._gitDefaultOptions({ method: "HEAD" }),
      [404]
    ).then(async headResult => {
      let logNote = "Found...";
      if (headResult.status === 404) {
        logNote = "Uploading...";

        //https://docs.github.com/en/rest/reference/git#blobs
        await this._postSomeJson("/git/blobs", {
          content: buffer.toString("base64"),
          encoding: "base64"
        });

        this.lastRunStats.Blobs_Uploaded =
          (this.lastRunStats.Blobs_Uploaded || 0) + 1;
      }

      //List all the files being uploaded/matched
      [...this.#fileMap]
        .filter(([, value]) => value.sha === sha)
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
   * @param {number} prnumber
   * @param {PrStatus} [originalData]
   */
  async _getPrStatus(prnumber, originalData) {
    const header = originalData?.etag
      ? {
          headers: { "If-None-Match": originalData.etag }
        }
      : null;

    //https://docs.github.com/en/rest/reference/pulls#get-a-pull-request
    /** @type {PrStatus} */
    const jsonResult = await this._getSomeJson(`/pulls/${prnumber}`, header, [
      304
    ]);

    const status = this.lastFetchResponse.status;
    const etag = this.lastFetchResponse.headers.get("etag");

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
   * @param {string} commitsha
   * @param {PrCheckStatus} [originalData]
   */
  async _getPrCheckStatus(commitsha, originalData) {
    const header = originalData?.etag
      ? {
          headers: { "If-None-Match": originalData.etag }
        }
      : null;

    //https://docs.github.com/en/rest/reference/checks#list-check-runs-for-a-git-reference
    /** @type {PrCheckStatus} */
    const jsonResult = await this._getSomeJson(
      `/commits/${commitsha}/check-runs`,
      header,
      [304]
    );

    const status = this.lastFetchResponse.status;
    const etag = this.lastFetchResponse.headers.get("etag");

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
   * Push all the files added to the tree to the repository
   */
  async treePush() {
    this.lastRunStats = {
      Name: `treePush - ${this.options.commit_message || "(No commit message)"}`
    };

    const referenceTree = await this._readTree();

    await this._syncBlobs();

    const updatetree = this._deltaTree(referenceTree);

    const commit = await this._createCommitFromTree(
      updatetree,
      this.options.commit_message
    );

    const compare = await this._compareCommit(commit);

    if (compare?.files.length) {
      //Changes to apply

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
        await this._postSomeJson("/git/refs", {
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
        const prResult = await this._postSomeJson("/pulls", prOptions);

        if (issue_options) {
          //https://docs.github.com/en/rest/reference/issues#update-an-issue
          await this._postSomeJson(
            `/issues/${prResult.number}`,
            issue_options,
            {
              method: "PATCH"
            }
          );
        }

        if (review_options) {
          //https://docs.github.com/en/rest/reference/pulls#request-reviewers-for-a-pull-request
          await this._postSomeJson(
            `/pulls/${prResult.number}/requested_reviewers`,
            review_options
          );
        }

        if (auto_merge) {
          if (auto_merge_delay) {
            console.log(`Waiting ${auto_merge_delay}ms before merging PR...`);
            await sleep(auto_merge_delay);
          }
          let checkStatus = await this._getPrCheckStatus(commit.sha);
          let prStatus = await this._getPrStatus(prResult.number);

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

            prStatus = await this._getPrStatus(prResult.number, prStatus);

            checkStatus = await this._getPrCheckStatus(commit.sha, checkStatus);

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
          await this._postSomeJson(
            `/pulls/${prResult.number}/merge`,
            { merge_method: "squash" },
            {
              method: "PUT"
            }
          );

          //Check before deleting (In case of auto-delete)
          const headResult = await this._fetchResponse(
            `/git/refs/heads/${prResult.head.ref}`,
            this._gitDefaultOptions({ method: "HEAD" }),
            [404]
          );

          if (headResult.ok) {
            //https://docs.github.com/en/rest/reference/git#delete-a-reference
            await this._fetchResponse(
              `/git/refs/heads/${prResult.head.ref}`,
              this._gitDefaultOptions({ method: "DELETE" })
            );
          }
        }
        this.lastRunStats.Pull_Request_URL = prResult.html_url;
      } else {
        //Just a simple commit on this branch
        //https://docs.github.com/en/rest/reference/git#update-a-reference
        await this._postSomeJson(
          `/git/refs/heads/${this.options.base}`,
          {
            sha: commit.sha
          },
          { method: "PATCH" }
        );
      }
    }

    return this.lastRunStats;
  }
}

module.exports = GitHubTreePush;