import React from 'react'
import Immutable from "immutable";
import { Editor } from 'slate-react'
import { Value, Block } from 'slate'
import diff from './intelie_diff/diff'
import customToJSON from "./utils/customToJson"
import { applyImmutableDiffOperations } from "./utils/immutableDiffToAutomerge"
import { applySlateOperations } from "./utils/slateOpsToAutomerge"
import { convertAutomergeToSlateOps } from "./utils/convertAutomergeToSlateOps"
import slateDiff from 'slate-diff'
import Automerge from 'automerge'
import { Client } from "./client"

var path = require('./intelie_diff/path');
var concatPath = path.concat,
                  escape = path.escape;

const initialValue = {
  document: {
    nodes: [
      {
        object: 'block',
        type: 'paragraph',
        nodes: [
          {
            object: 'text',
            leaves: [
              {
                text: 'A line of text in a paragraph.'
              }
            ]
          }
        ]
      },
      {
        object: 'block',
        type: 'paragraph',
        nodes: [
          {
            object: 'text',
            leaves: [
              {
                text: 'Another line of text'
              }
            ]
          }
        ]
      },
      {
        object: 'block',
        type: 'paragraph',
        nodes: [
          {
            object: 'text',
            leaves: [
              {
                text: 'Yet another line of text'
              }
            ]
          }
        ]
      }
    ]
  }
};

let doc = Automerge.init();
const initialSlateValue = Value.fromJSON(initialValue);
const initialSlateValue2 = Value.fromJSON(initialValue);
console.log(customToJSON(initialSlateValue.document))
doc = Automerge.change(doc, 'Initialize Slate state', doc => {
  doc.note = customToJSON(initialSlateValue.document);
})
const savedAutomergeDoc = Automerge.save(doc);

class App extends React.Component {

    constructor(props) {
      super(props)

      this.broadcast = this.broadcast.bind(this);
      this.client = [];

      this.state = {
        online: true,
      }

      // this.reflectDiff = this.reflectDiff.bind(this)
      // this.reflectDiff2 = this.reflectDiff2.bind(this)
    }

    // FIXME: Unexpected behavior for the following scenarios:
    //   Merge nodes and immediately insert text
    //     Expected: Proper merge and text insert
    //     Actual: Inserted text overwrites some chars in merged node
    //     Probably because merge node is equal to delete entire nodes
    //     and re-insert with new text

    // reflectDiff = () => {
    //   let changesTotal1 = [];
    //   this.state.doc1OfflineHistory.forEach((changes) => {
    //     changesTotal1 = changesTotal1.concat(changes)
    //   })

    //   this.applyDiffToDoc2(changesTotal1);

    //   let changesTotal2 = [];
    //   this.state.doc2OfflineHistory.forEach((changes) => {
    //     changesTotal2 = changesTotal2.concat(changes)
    //   })

    //   this.applyDiffToDoc1(changesTotal2);

    //   this.setState({
    //     doc1OfflineHistory: Immutable.List(),
    //     doc2OfflineHistory: Immutable.List(),
    //   })
    // }

    // reflectDiff2 = () => {
    //   const doc1new = Automerge.merge(doc1, doc2)
    //   const doc2new = Automerge.merge(doc2, doc1new)

    //   const changes1 = Automerge.getChanges(doc1, doc1new)
    //   const changes2 = Automerge.getChanges(doc2, doc2new)

    //   this.applyDiffToDoc1(changes1)
    //   this.applyDiffToDoc2(changes2)
    // }

    /////////////////////////////
    offlineSync = () => {
      let docs = [];
      this.client.forEach((client, idx) => {
        docs[idx] = client.getAutomergeDoc();
      });

      let mergedDoc = docs[0];
      docs.forEach((nextDoc, idx) => {
        if (idx === 0) return;
        mergedDoc = Automerge.merge(mergedDoc, nextDoc);
      });

      this.client.forEach((client, idx) => {
        client.updateWithNewAutomergeDoc(mergedDoc);
      });

    }

    broadcast = (clientNumber, changes) => {
      this.client.forEach((client, idx) => {
        if (clientNumber !== idx) {
          client.updateWithRemoteChanges(changes);
        }
      })
    }

    toggleOnline = () => {
      this.setState({online: !this.state.online});
    }

    render = () => {
        let onlineText;
        let toggleButtonText;
        if (this.state.online) {
          onlineText = "CURRENTLY LIVE SYNCING"
          toggleButtonText = "Toggle offline mode"
        } else {
          onlineText = "CURRENTLY OFFLINE"
          toggleButtonText = "Toggle online mode"
        }

        return (
          <div>
            <div>{onlineText}</div>
            <hr></hr>
            <Client
                key={0}
                clientNumber={0}
                ref={(client) => {this.client[0] = client}}
                savedAutomergeDoc={savedAutomergeDoc}
                initialSlateValue={initialSlateValue}
                broadcast={this.broadcast}
                online={this.state.online}
            />
            <hr></hr>
            <Client
                key={1}
                clientNumber={1}
                ref={(client) => {this.client[1] = client}}
                savedAutomergeDoc={savedAutomergeDoc}
                initialSlateValue={initialSlateValue2}
                broadcast={this.broadcast}
                online={this.state.online}
            />
            <hr></hr>
            <button onClick={this.toggleOnline}>{toggleButtonText}</button>
            {!this.state.online &&
              <button onClick={this.offlineSync}>Sync off-line mode</button>
            }
          </div>
        )
    }

}

export default App
