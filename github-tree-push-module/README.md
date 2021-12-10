# GitHub Tree Push

A module for pushing content to GitHub. You can use it for complicated folder structure updates or just a single file.

## Features

- Multiple file updates can be combined into a single commit
- GitHub compatible file hashing reduces the I/O required to push content
- Implicit file renaming
- Multi-threaded file uploads
- Pull requests can created from the commit
- Pull request auto-approval that waits for checks to finish before approving
- Add labels/assignees/reviewers to pull requests
- Auto retry for common connection errors
- Fully authenticated and conditional requests conserves rate-limit
- Huge tree support splits large trees while still maintaining a single commit
- Asynchronous input file download support

## Why use this?

Most people who use GitHub's API use separate file requests to push their content to GitHub. They expect GitHub to handle all the file compare work. That's fine for small, infrequent updates.

But it can be slow if you're updating more complex collections of files. Sending separate files in separate commits can create conflicts as the files are not updated transactionally.

Placing multiple file operations in single commit:

- Manages changes better
- Handles renames properly
- Prevents conflicts
- Connects duplicate files
- Makes updates transactional
- Reduces connection overhead

See [Trees explained](#trees-explained) to find out how this module uses trees.

## Sample Usage

### Prerequisites

```js
const { GitHubTreePush } = require("@cagov/github-tree-push"); //treePush Class
const token = process.env["GITHUB_TOKEN"]; //Keep your GitHub token safe
```

### Setting up a tree

Declare your GitHub target (`owner`/`repo`/`base`/`path`) in each tree instance you create. Find detailed options in [treePush options](#treepush-options).

```js
let tree1 = new GitHubTreePush(token, {
  owner: "my-github-owner",
  repo: "my-github-repository",
  base: "my-github-branch",
  path: "my-path-inside-repository"
});
```

### Adding files to a tree

Fill your tree with file names and data. Data is not transmitted until you push the tree with `treePush`.

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
```

### Getting info on the last push

You can get information about the last push operation using `lastRunStats`. Find details in [lastRunStats Output](#lastRunStats-output).

```js
console.log(JSON.stringify(tree1.lastRunStats, null, 2));
```

### Alternate tree setup for pull requests

There are many options for sending your content as a Pull Request. Find detailed options in [Pull request options](#pull-request-options).

```js
let tree1 = new GitHubTreePush(token, {
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

## Object methods

These are the most commonly used methods.

### `syncFile(path, content)`

Sets a single file to the tree to be syncronized (updated or added).

#### `syncFile` parameters

| Parameter Name | Type             | Description                                    |
| :------------- | :--------------- | :--------------------------------------------- |
| **`path`**     | string           | **Required.** Path to use for publishing file. |
| **`content`**  | string \| Buffer | **Required.** Content to use for the file.     |

### `syncDownload(path, url)`

Adds a content URL to be downloaded asyronously before the push happens.

#### `syncDownload` parameters

| Parameter Name | Type   | Description                                    |
| :------------- | :----- | :--------------------------------------------- |
| **`path`**     | string | **Required.** Path to use for publishing file. |
| **`url`**      | string | **Required.** URL for the content to download. |

### `removeFile(path)`

Sets a file to be removed.

#### `removeFile` Parameters

| Parameter Name | Type   | Description                               |
| :------------- | :----- | :---------------------------------------- |
| **`path`**     | string | **Required.** Path of file to be removed. |

### `doNotRemoveFile(path)`

Sets a file to **not** be removed when `removeOtherFiles:true`.

#### `doNotRemoveFile` parameters

| Parameter Name | Type   | Description                                 |
| :------------- | :----- | :------------------------------------------ |
| **`path`**     | string | **Required.** Path of file to be preserved. |

### `treePushDryRun()`

Returns a list of paths that will be changed if this is run.

### `treePush()`

Push all the files added to the tree to the repository.

## Options explained

### `treePush` options

| Property Name              | Type    | Default               | Description                                                                             |
| :------------------------- | :------ | :-------------------- | :-------------------------------------------------------------------------------------- |
| **`owner`**                | string  |                       | **Required.** GitHub _owner_ path.                                                      |
| **`repo`**                 | string  |                       | **Required.** GitHub _repo_ path.                                                       |
| **`base`**                 | string  |                       | **Required.** The name of the base branch that the head will be merged into (main/etc). |
| **`path`**                 | string  | `/`                   | Starting path in the repo for changes to start from.                                    |
| **`deleteOtherFiles`**     | boolean | `false`               | Set as `true` to delete other files in the path when pushing.                           |
| **`recursive`**            | boolean | `true`                | Set as `true` to compare sub-folders too.                                               |
| **`contentToBlobBytes`**   | number  | `50000`               | Content bytes allowed in content tree before turning it into a separate blob upload.    |
| **`commit_message`**       | string  | `"No commit message"` | Name to identify the commit.                                                            |
| **`pull_request`**         | boolean | `false`               | Set as `true` to use a pull request.                                                    |
| **`pull_request_options`** | object  | `{}`                  | Options if using a pull request. See [pull request options](#pull-request-options).     |

### Pull request options

Options based on [GitHub pull request docs](https://docs.github.com/en/rest/reference/pulls#create-a-pull-request).

| Property Name               | Type    | Default | Description                                                                                     |
| :-------------------------- | :------ | :------ | :---------------------------------------------------------------------------------------------- |
| **`title`**                 | string  |         | The title of the new pull request. (Leave `issue` blank if you use this.)                       |
| **`issue`**                 | number  |         | Issue number this pull request replaces (Leave `title` blank if you use this.)                  |
| **`body`**                  | string  |         | The contents describing the pull request.                                                       |
| **`maintainer_can_modify`** | boolean | `false` | Sets whether maintainers can modify the pull request.                                           |
| **`draft`**                 | boolean | `false` | Sets whether the pull request is a draft.                                                       |
| **`review_options`**        | object  | `{}`    | Options for [pull request reviews](#pull-request-review-options).                               |
| **`issue_options`**         | object  | `{}`    | Options for [pull request issue](#pull-request-issue-options).                                  |
| **`automatic_merge`**       | boolean | `false` | Set as `true` to merge the pull request after creating it. Will wait for status checks to pass. |
| **`automatic_merge_delay`** | number  | `0`     | MS to delay after creating before attempting to merge.                                          |

### Pull request review options

Options based on [GitHub review request docs](https://docs.github.com/en/rest/reference/pulls#request-reviewers-for-a-pull-request).

| Property Name   | Type     | Description                                           |
| :-------------- | :------- | :---------------------------------------------------- |
| **`milestone`** | number   | The number for the milestone to associate this issue. |
| **`labels`**    | string[] | Issue labels to apply to the pull request.            |
| **`assignees`** | string[] | Logins for users to assign to this issue.             |

### Pull request issue options

Options based on [GitHub issue docs](https://docs.github.com/en/rest/reference/issues#update-an-issue).

| Property Name        | Type     | Description                       |
| :------------------- | :------- | :-------------------------------- |
| **`reviewers`**      | string[] | Requests an array of user logins. |
| **`team_reviewers`** | string[] | Requests an array of team slugs.  |

### `lastRunStats` output

When looking at the last run, the following data is available:

| Property Name                       | Type   | Description                                                                    |
| :---------------------------------- | :----- | :----------------------------------------------------------------------------- |
| **`Name`**                          | string | Identifies this stat report.                                                   |
| **`Tree_Operations`**               | number | Number of CRUD operations in the new tree.                                     |
| **`Content_Converted_To_Blobs`**    | number | Text content that will be uploaded separately (because of duplicates or size). |
| **`Blobs_Uploaded`**                | number | Number of blobs uploaded to GitHub just now.                                   |
| **`Text_Content_Uploaded`**         | number | Number of text content strings that were uploaded together in the tree.        |
| **`Target_Tree_Size`**              | number | The original tree size.                                                        |
| **`Files_Deleted`**                 | number | Files deleted from GitHub in this tree.                                        |
| **`Files_Referenced`**              | number | Files where a SHA reference to a blob was added/moved.                         |
| **`Commit_URL`**                    | string | The GitHub URL for the commit details.                                         |
| **`Pull_Request_URL`**              | string | The GitHub URL for the pull request details.                                   |
| **`GitHub_Rate_Limit_Remaining`**   | number | How many more requests are allowed this hour.                                  |
| **`GitHub_Rate_Limit_Retry_After`** | number | How long to wait before trying again.                                          |

## Trees explained

Trees are an excellent way to communicate changes with GitHub.

### What does a tree look like?

A tree with 2 file updates would look like this.

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

The commit includes both updates.

### How renames work

To rename a file, delete the old name and add the new name in the same tree. As long as these operations are in the same tree, GitHub will notice this and consider it a rename. This module keeps track of the hashes so you do not have to send them again if they are the same.

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

### Support for large file updates

Binary files, large content, and duplicate files are uploaded as new content multi-threaded. Place their unique hashes in the tree (`sha`) instead of the `content`. GitHub stores these "blobs" in the repository disconnected from the folder structure. Submit a tree update that references the hash of the blob to upload the blob. This means large files get committed to the repo transactionally, without conflicts. If a problem occurs in the update, each blob is still stored disconnected waiting for a tree to reference it. You do not have uploaded it again.

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

The tree is very small to transmit. This is because the heavy file work (transferring the binary files in separate threads) happened before the tree was submitted.

Project locations

- [NPM](https://www.npmjs.com/package/@cagov/github-tree-push)
- [GitHub](https://github.com/cagov/github-tree-push)
