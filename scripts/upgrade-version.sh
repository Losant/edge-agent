#!/bin/bash
set -eo pipefail

currentVersion=$(awk '/"version"/ { print $2 }' packages/losant-edge/package.json)
currentVersion=$(echo $currentVersion | sed -r 's/"//g' | sed -r 's/,//g')
currentMajorMinor=${currentVersion%.*}
currentMajor=${currentMajorMinor%.*}

read -p "Current Edge agent version is $currentVersion. What is the new version?  " newVersion
newMajorMinor=${newVersion%.*}
newMajor=${newMajorMinor%.*}

sed -i '' "s/\"version\": \"$currentVersion\"/\"version\": \"$newVersion\"/g" packages/losant-edge/package.json
sed -i '' "s/org.label-schema.schema-version=\"$currentVersion\"/org.label-schema.schema-version=\"$newVersion\"/g" "./packages/losant-edge/Dockerfile"
sed -i '' "s/org.label-schema.schema-version=\"$currentVersion\"/org.label-schema.schema-version=\"$newVersion\"/g" "./packages/losant-edge/alpine.Dockerfile"
sed -i '' "s/org.label-schema.schema-version=\"$currentVersion\"/org.label-schema.schema-version=\"$newVersion\"/g" "./packages/losant-edge/sle.Dockerfile"

sed -i '' "s/\`$currentVersion\`, \`$currentMajorMinor\`, \`$currentMajor\`, \`latest\`/\`$newVersion\`, \`$newMajorMinor\`, \`$newMajor\`, \`latest\`/g" ./packages/losant-edge/README-Docker.md
TYPES=(
  'amd64'
  'arm'
  'arm64'
  'alpine'
  'alpine-amd64'
  'alpine-arm'
  'alpine-arm64'
)
for TYPE in ${TYPES[@]}
do
  sed -i '' "s/\`$currentVersion-$TYPE\`, \`$currentMajorMinor-$TYPE\`, \`$currentMajor-$TYPE\`, \`latest-$TYPE\`/\`$newVersion-$TYPE\`, \`$newMajorMinor-$TYPE\`, \`$newMajor-$TYPE\`, \`latest-$TYPE\`/g" ./packages/losant-edge/README-Docker.md
done


packagePaths=($(find ./packages * | grep -e "^packages/losant-[a-zA-Z\-]*/package.json$"))

for path in "${packagePaths[@]}"; do
  sed -i '' "s/\"version\": \"$currentVersion\"/\"version\": \"$newVersion\"/g" $path
done