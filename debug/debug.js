//@ts-check
//Loading environment variables
const { Values } = require("../local.settings.json");

// @ts-ignore
Object.keys(Values).forEach(x => (process.env[x] = Values[x])); //Load local settings file for testing

// @ts-ignore
process.env.debug = true; //set to false or remove to run like the real instance

const { GitHubTreePush } = require("@cagov/github-tree-push");

(async () => {
  const token = process.env["GITHUB_TOKEN"] ?? "";
  const tree1 = new GitHubTreePush(token, {
    owner: "cagov",
    repo: "automation-development-target",
    base: "github-tree-push-testing",
    path: "github-tree-push",
    removeOtherFiles: true, //change to //removeOtherFiles
    contentToBlobBytes: 1
  });

  const suffix = "1"; //new Date().toString();

  tree1.syncFile("A/A/fileAA1.txt", `A${suffix}`);
  tree1.syncFile("A/A/fileAA2.txt", `B${suffix}`);
  tree1.syncFile("A/B/fileAB1.txt", `C${suffix}`);
  tree1.syncFile("A/B/fileAB2.txt", `D${suffix}`);
  tree1.syncFile("Target File.txt", `E${suffix}`);

  tree1.syncFile(
    "Special Path옹엄얼언웅워원월/Special File옹엄얼언웅워원월.txt",
    "some data 옹엄얼언웅워원월"
  );

  await tree1.treePush();

  console.log(JSON.stringify(tree1.lastRunStats, null, 2));

  const rootTree = new GitHubTreePush(token, {
    owner: "cagov",
    repo: "automation-development-target",
    base: "github-tree-push-testing",
    recursive: false,
    removeOtherFiles: true,
    commit_message: "Root Tree Push",
    pull_request: true,
    pull_request_options: {
      draft: false,
      body: "Pull Request Body",
      title: "My Auto Merge Title",
      automatic_merge: true
      //automatic_merge_delay: 100,
      //issue_options: {
      //  labels: ["Label 1", "Label 2"],
      //  assignees: ["carterm"]
      //},
      //review_options: {
      //  reviewers: ["wpserviceuser"]
      //}
    }
  });
  const binaryString = "My Buffer Text 1";
  const binaryData = Buffer.from(binaryString);
  rootTree.syncFile("Root File.txt", "Root File Data");
  rootTree.syncFile("Root Buffer.txt", binaryData);
  rootTree.syncFile("Root Buffer2.txt", binaryData);

  await rootTree.treePush();

  console.log(JSON.stringify(rootTree.lastRunStats, null, 2));
})();
