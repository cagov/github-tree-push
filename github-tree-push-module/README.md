# GitHub Tree Push

A module for pushing content to GitHub, be it complicated folder structure updates, or just a single file.

## Features

- Multiple file updates can be combined into a single commit.
- GitHub compatible file hashing reduces the I/O required to push content.
- Implicit file renaming.
- Multi-threaded file uploads.
- Pull Requests can created from the commit.
- Pull Request auto-approval that waits for checks to finish before approving.
- Add labels/assignees/reviewers to Pull Requests.
- Auto retry for common connection errors.
- Fully authenticated and conditional requests conserves rate-limit.
- Huge tree support splits large trees while still maintaining a single commit.

## Why use this?

Most users of GitHub's API use separate file requests to push their content to GitHub, expecting GitHub to handle all the file compare work. That's fine for small, infrequent updates, but it can be really slow if you are updating more complex collections of files. Additionally, sending separate files in separate commits can create conflicts as the files aren't updated transactionally.

Placing multiple file operations in single commit manages changes better; renames are handled properly, conflicts are prevented, duplicate files are connected, updates are transactional, connection overhead is reduced.

See [Below](#trees-explained) for an explanation of how this module uses trees.

## Sample Usage

### Pre-requisites

```js
const treePush = require("@cagov/github-tree-push"); //treePush Class
const token = process.env["GITHUB_TOKEN"]; //Keep your GitHub token safe
```

### Setting up a tree

Declare your GitHub target (`owner`/`repo`/`base`/`path`) in each tree instance you create. Detailed options [Below](#treepush-options).

```js
let tree1 = new treePush(token, {
  owner: "my-github-owner",
  repo: "my-github-repository",
  base: "my-github-branch",
  path: "my-path-inside-repository"
});
```

### Adding files to a tree

Fill your tree with file names and data. No data is transmitted until you push the tree with `treePush`.

```js
tree1.syncFile("Root File.txt", "Root File Data"); //Strings
let binaryData = Buffer.from("My Buffer Text 1");
tree1.syncFile("Root Buffer.txt", binaryData); //Or binary Data
tree1.syncFile("Parent Folder/Nester Folder/fileAB1.txt", "Path File Data"); //Paths
```

### Sending the content to GitHub

One method performs the work once the tree is set up.

```js
await tree1.treePush();
//See the results
console.log(JSON.stringify(tree1.lastRunStats, null, 2));
```

### Alternate tree setup for Pull Requests

There are many options for sending your content as a Pull Request.

```js
let tree1 = new treePush(token, {
  owner: "cagov",
  repo: "my-github-target",
  base: "github-tree-push-branch",
  path: "github-tree-push-path",
  deleteOtherFiles: true,
  contentToBlobBytes: 2000,
  commit_message: "My Tree Push Commit",
  pull_request: true,
  pull_request_options: {
    draft: false,
    body: "Pull Request Body",
    title: "My Auto Merge Title",
    auto_merge: true
    auto_merge_delay: 1000,
    issue_options: {
      labels: ["Label 1", "Label 2"],
      assignees: ["assigned_username"]
    },
    review_options: {
      reviewers: ["reviewer_username"]
    }
});
```

## Object Methods

These are the most commonly used methods.

### `syncFile(path, content)`

Sets a single file to the tree to be syncronized (updated or added).

#### `syncFile` Parameters

| Parameter Name | Type             | Description                                    |
| :------------- | :--------------- | :--------------------------------------------- |
| **`path`**     | string           | **Required.** Path to use for publishing file. |
| **`content`**  | string \| Buffer | **Required.** Content to use for the file.     |

### `removeFile(path)`

Sets a file to removed.

#### `removeFile` Parameters

| Parameter Name | Type   | Description                               |
| :------------- | :----- | :---------------------------------------- |
| **`path`**     | string | **Required.** Path of file to be removed. |

### `doNotRemoveFile(path)`

Sets a file to NOT be removed when `removeOtherFiles:true`.

#### `doNotRemoveFile` Parameters

| Parameter Name | Type   | Description                                 |
| :------------- | :----- | :------------------------------------------ |
| **`path`**     | string | **Required.** Path of file to be preserved. |

### `treePush()`

Push all the files added to the tree to the repository.

#### `treePush` options

| Property Name              | Type    | Description                                                                                        |
| :------------------------- | :------ | :------------------------------------------------------------------------------------------------- |
| **`owner`**                | string  | **Required.** GitHub _owner_ path.                                                                 |
| **`repo`**                 | string  | **Required.** GitHub _repo_ path.                                                                  |
| **`base`**                 | string  | **Required.** The name of the base branch that the head will be merged into (main/etc).            |
| **`path`**                 | string  | Starting path in the repo for changes to start from. Defaults to root.                             |
| **`deleteOtherFiles`**     | boolean | `true` to delete other files in the path when pushing.                                             |
| **`recursive`**            | boolean | `true` to compare sub-folders too.                                                                 |
| **`contentToBlobBytes`**   | number  | Content bytes allowed in content tree before turning it into a separate blob upload. Default 1000. |
| **`commit_message`**       | string  | Name to identify the Commit.                                                                       |
| **`pull_request`**         | boolean | `true` to use a Pull Request.                                                                      |
| **`pull_request_options`** | object  | Options if using a Pull Request. See [Below](#pull-request-options).                               |

#### Pull Request options

Options orginating from [GitHub Pull Request Docs](https://docs.github.com/en/rest/reference/pulls#create-a-pull-request).

| Property Name               | Type    | Description                                                                    |
| :-------------------------- | :------ | :----------------------------------------------------------------------------- |
| **`title`**                 | string  | The title of the new pull request. (Leave `issue` blank if you use this)       |
| **`issue`**                 | number  | Issue number this pull request replaces (Leave `title` blank if you use this)  |
| **`body`**                  | string  | The contents describing the pull request.                                      |
| **`maintainer_can_modify`** | boolean | Indicates whether maintainers can modify the pull request.                     |
| **`draft`**                 | boolean | Indicates whether the pull request is a draft.                                 |
| **`review_options`**        | string  | Options for reviewers. See [Below](#pull-request-review-options).              |
| **`issue_options`**         | string  | Options for issue. See [Below](#pull-request-issue-options).                   |
| **`automatic_merge`**       | boolean | `true` to merge the PR after creating it. Will wait for status checks to pass. |
| **`automatic_merge_delay`** | number  | MS to delay after creating before attempting to merge.                         |

#### Pull Request Review options

Options originating from [GitHub Review Request Docs](https://docs.github.com/en/rest/reference/pulls#request-reviewers-for-a-pull-request).

| Property Name   | Type     | Description                                           |
| :-------------- | :------- | :---------------------------------------------------- |
| **`milestone`** | number   | The number for the milestone to associate this issue. |
| **`labels`**    | string[] | Issue labels to apply to the Pull Request.            |
| **`assignees`** | string[] | Logins for users to assign to this issue.             |

#### Pull Request Issue options

Options originating from [GitHub Issue Docs](https://docs.github.com/en/rest/reference/issues#update-an-issue).

| Property Name        | Type     | Description                                     |
| :------------------- | :------- | :---------------------------------------------- |
| **`reviewers`**      | string[] | An array of user logins that will be requested. |
| **`team_reviewers`** | string[] | An array of team slugs that will be requested.  |

## Trees explained

Trees are an excellent way to communicate changes with GitHub.

### What does a tree look like?

A tree with 2 file updates would look similiar to this.

```js
{
  tree: [
    {
      path: "file 1.txt",
      content: "File 1 Content..."
    },
    {
      path: "file 2.txt",
      content: "File 2 Content..."
    }
  ];
}
```

Both updates would be included in the commit together.

### How renames are supported

To rename a file, you delete the old name and add the new name in the same tree. As long as these operations are in the same tree, GitHub will notice this and consider it a rename. This module will keep track of the hashes so that the content doesn't have to be transmitted again if it is the same.

This example renames `original file name.txt` to `new file name.txt`.

```js
{
  tree: [
    {
      path: "original file name.txt",
      sha: null
    },
    {
      path: "new file name.txt",
      sha: "[hash for original file]"
    }
  ];
}
```

"`sha: null`" lets GitHub know to remove the old file, combined with the original `sha` added to the new location, it will be treated as a rename.

### How large file updates are supported

Binary files, large content and duplicate files are handled by uploading new content multi-threaded, and then placing their unique hashes in the tree (`sha`) instead of the `content`. GitHub stores these "blobs" in the repository disconnected from the folder structure, until a tree update that references the hash of the blob is submitted. Large files will therefore be committed to the repo transactionally, without conflicts. If a problem occurs in the update, each blob is still stored disconnected waiting for a tree to reference it, and doesn't have to be uploaded again.

Here is a simple tree update that associates already uploaded blobs with files in the commit.

```js
{
  tree: [
    {
      path: "big file 1.json",
      sha: "[hash for big file 1]"
    },
    {
      path: "big file 2.json",
      sha: "[hash for big file 2]"
    }
  ];
}
```

Since the heavy file work, transferring the binary files in separate threads, was done before the tree was submitted, the actual tree is very small to transmit.

Project locations

- [NPM](https://www.npmjs.com/package/@cagov/github-tree-push)
- [GitHub](https://github.com/cagov/github-tree-push)
